import {
  PublicKey,
  Transaction,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  SystemProgram,
  GetProgramAccountsFilter,
  KeyedAccountInfo, AccountMeta,
} from '@solana/web3.js'

import Tx from '../core/tx'
import SPLT from '../splt'
import account from '../account'
import schema, { AccountData, PoolData } from '../schema'
import {
  DEFAULT_SWAP_PROGRAM_ADDRESS,
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_SPLATA_PROGRAM_ADDRESS,
} from '../default'
import { RoutingAddress, WalletInterface } from '../rawWallet'
import oracle from './oracle'
import { CodeInstruction } from './constant'
import { ProgramError } from './error'

const soproxABI = require('soprox-abi')
const xor = require('buffer-xor')

export type SwapAccountChangeInfo = {
  type: 'pool'
  address: string
  data: Buffer
}

const ErrorMapping = [
  'Invalid instruction',
  'Incorrect program id',
  'Operation overflowed',
  'Invalid owner',
  'Invalid LP proof',
  'Cannot input a zero amount',
  'The account was initialized already',
  'The provided accounts are unmatched to the pool',
  'Cannot initialize a pool with two same mints',
  'Exceed limit',
]

class Swap extends Tx {
  readonly swapProgramId: PublicKey
  readonly spltProgramId: PublicKey
  readonly splataProgramId: PublicKey
  private _splt: SPLT

  static oracle = oracle

  constructor(
    swapProgramAddress = DEFAULT_SWAP_PROGRAM_ADDRESS,
    spltProgramAddress = DEFAULT_SPLT_PROGRAM_ADDRESS,
    splataProgramAddress = DEFAULT_SPLATA_PROGRAM_ADDRESS,
    nodeUrl: string,
  ) {
    super(nodeUrl, ErrorMapping)

    if (!account.isAddress(swapProgramAddress))
      throw new Error('Invalid swap program address')
    if (!account.isAddress(spltProgramAddress))
      throw new Error('Invalid SPL token program address')
    if (!account.isAddress(splataProgramAddress))
      throw new Error('Invalid SPL associated token program address')
    this.swapProgramId = account.fromAddress(swapProgramAddress) as PublicKey
    this.spltProgramId = account.fromAddress(spltProgramAddress) as PublicKey
    this.splataProgramId = account.fromAddress(
      splataProgramAddress,
    ) as PublicKey

    this._splt = new SPLT(spltProgramAddress, splataProgramAddress, nodeUrl)
  }

  /**
   * Watch account changes
   * @param callback
   * @param filters
   * @returns Watch id
   */
  watch = (
    callback: (
      error: string | null,
      data: (Omit<SwapAccountChangeInfo, 'data'> & { data: PoolData }) | null,
    ) => void,
    filters?: GetProgramAccountsFilter[],
  ): number => {
    const cb = ({
                  accountId,
                  accountInfo: { data: buf },
                }: KeyedAccountInfo) => {
      const address = accountId.toBase58()
      const poolSpace = new soproxABI.struct(schema.POOL_SCHEMA).space
      let type = null
      let data = {}
      if (buf.length === poolSpace) {
        type = 'pool'
        data = this.parsePoolData(buf)
      }
      if (!type) return callback('Unmatched type', null)
      return callback(null, {
        type: type as SwapAccountChangeInfo['type'],
        address,
        data: data as PoolData,
      })
    }
    return this.connection.onProgramAccountChange(
      this.swapProgramId,
      cb,
      'confirmed',
      filters,
    )
  }

  /**
   * Unwatch a watcher by watch id
   * @param watchId
   * @returns
   */
  unwatch = async (watchId: number): Promise<void> => {
    if (!watchId) return
    return await this.connection.removeProgramAccountChangeListener(watchId)
  }

  /**
   * Generate a proof address
   * The lp mints is differentiated to spl mints by its freeze authority
   * The lp mint's freeze authority is assigned to the proof address
   * @param poolAddress
   * @returns A corresponding proof address to a pool address
   */
  private genProofAddress = async (poolAddress: string): Promise<string> => {
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    const { treasurerPublicKey } = await this.getTreasurer(poolAddress)
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const proof = new PublicKey(
      xor(
        this.swapProgramId.toBuffer(),
        xor(poolPublicKey.toBuffer(), treasurerPublicKey.toBuffer()),
      ),
    )
    return proof.toBase58()
  }

  /**
   * Derive the corresponding pool address to the splt mint
   * @param mintAuthorityAddress
   * @param freezeAuthorityAddress
   * @returns
   */
  derivePoolAddress = async (
    mintAuthorityAddress: string,
    freezeAuthorityAddress: string,
  ): Promise<string | undefined> => {
    if (!account.isAddress(mintAuthorityAddress))
      throw new Error('Invalid mint authority address')
    if (!account.isAddress(freezeAuthorityAddress))
      throw new Error('Invalid freeze authority address')

    const mintAuthorityPublicKey = account.fromAddress(
      mintAuthorityAddress,
    ) as PublicKey
    const freezeAuthorityPublicKey = account.fromAddress(
      freezeAuthorityAddress,
    ) as PublicKey // Proof address of mint LPT
    const poolPublicKey = new PublicKey(
      xor(
        this.swapProgramId.toBuffer(),
        xor(
          freezeAuthorityPublicKey.toBuffer(),
          mintAuthorityPublicKey.toBuffer(),
        ),
      ),
    )
    const { treasurerPublicKey } = await this.getTreasurer(
      poolPublicKey.toBase58(),
    )
    if (treasurerPublicKey.toBase58() != mintAuthorityPublicKey.toBase58())
      return undefined
    return poolPublicKey.toBase58()
  }

  /**
   * Find a treasury account of a pool by a mint address
   * @param mintAddress
   * @param poolData
   * @returns
   */
  private findTreasury = (mintAddress: string, poolData: PoolData): string => {
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    const { mint_a, mint_b, treasury_a, treasury_b } = poolData
    const mints = [mint_a, mint_b]
    const treasuries = [treasury_a, treasury_b]
    const index = mints.findIndex((address) => address === mintAddress)
    if (index < 0) throw new Error('There is no treasury account matched')
    return treasuries[index]
  }

  /**
   * Derive a set of treasury address corresponding to mint addresses
   * @param treasurerAddress
   * @param mintAddresses
   * @returns
   */
  private deriveTreasuryAddresses = async (
    treasurerAddress: string,
    mintAddresses: string[],
  ): Promise<string[]> => {
    const treasuryAddresses = await Promise.all(
      mintAddresses.map((mintAddress) => {
        return account.deriveAssociatedAddress(
          treasurerAddress,
          mintAddress,
          this.spltProgramId.toBase58(),
          this.splataProgramId.toBase58(),
        )
      }),
    )
    return treasuryAddresses
  }

  /**
   * Get treasurer
   * @param poolAddress
   * @returns
   */
  private getTreasurer = async (
    poolAddress: string,
  ): Promise<{
    treasurerAddress: string
    treasurerPublicKey: PublicKey
  }> => {
    const seed = [new PublicKey(poolAddress).toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.swapProgramId,
    )
    const treasurerAddress = treasurerPublicKey.toBase58()
    return { treasurerAddress, treasurerPublicKey }
  }

  /**
   * Parse pool buffer data
   * @param data
   * @returns
   */
  parsePoolData = (data: Buffer): PoolData => {
    const layout = new soproxABI.struct(schema.POOL_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get pool data
   * @param poolAddress
   * @returns
   */
  getPoolData = async (poolAddress: string): Promise<PoolData> => {
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const { data } = (await this.connection.getAccountInfo(poolPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${poolAddress}`)
    return this.parsePoolData(data)
  }

  /**
   * Parse lpt buffer data
   * @param data
   * @returns
   */
  parseLPTData = (data: Buffer): AccountData => {
    const layout = new soproxABI.struct(schema.ACCOUNT_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get lpt data
   * Indentical to get account (SPLT) data, but with pool check
   * @param lptAddress
   * @returns
   */
  getLPTData = async (
    lptAddress: string,
  ): Promise<AccountData & { pool: string }> => {
    if (!account.isAddress(lptAddress)) throw new Error('Invalid lpt address')
    const lptPublicKey = account.fromAddress(lptAddress) as PublicKey
    const { data } = (await this.connection.getAccountInfo(lptPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${lptAddress}`)
    const lptData = this.parseLPTData(data)
    const { mint: mintAddress } = lptData
    const { mint_authority, freeze_authority } = await this._splt.getMintData(
      mintAddress,
    )
    const poolAddress = await this.derivePoolAddress(
      mint_authority,
      freeze_authority,
    )
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    return { ...lptData, pool: poolAddress as string }
  }

  /**
   * Pretest initialize pool
   * @param transaction
   * @returns
   */
  private pretestInitializePool = async (
    transaction: Transaction,
  ): Promise<boolean> => {
    const {
      value: { err, logs },
    } = await this.connection.simulateTransaction(transaction)
    if (
      err &&
      (err as any).InstructionError &&
      ((err as any).InstructionError[1] == 'ProgramFailedToComplete' ||
        (err as any).InstructionError[1] == 'ComputationalBudgetExceeded')
    )
      return false
    return true
  }

  /**
   * Initialize a swap pool
   * @param deltaA Number of A (then first token)
   * @param deltaB Number of B (then second token)
   * @param ownerAddress Pool owner address
   * @param srcAAddress A source address
   * @param srcBAddress B source address
   * @param taxmanAddress Foundation SEN account address
   * @param wallet
   * @returns Transaction id, pool address, mint LPT address, lpt address
   */
  initializePool = async (
    deltaA: bigint,
    deltaB: bigint,
    ownerAddress: string,
    srcAAddress: string,
    srcBAddress: string,
    taxmanAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    mintLPTAddress: string
    poolAddress: string
    lptAddress: string
  }> => {
    // Validation
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    if (!account.isAddress(srcAAddress))
      throw new Error('Invalid source A address')
    if (!account.isAddress(srcBAddress))
      throw new Error('Invalid source B address')
    if (!account.isAddress(taxmanAddress))
      throw new Error('Invalid taxman address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const mintLPT = account.createAccount()
    const mintLPTAddress = mintLPT.publicKey.toBase58()
    const pool = await account.createStrictAccount(this.swapProgramId)
    const poolAddress = pool.publicKey.toBase58()
    const lptAddress = await this._splt.deriveAssociatedAddress(
      ownerAddress,
      mintLPTAddress,
    )
    const { mint: mintAAddress } = await this._splt.getAccountData(srcAAddress)
    const { mint: mintBAddress } = await this._splt.getAccountData(srcBAddress)
    // Build public keys
    const ownerPublicKey = account.fromAddress(ownerAddress) as PublicKey
    const lptPublicKey = account.fromAddress(lptAddress) as PublicKey
    const srcAPublicKey = account.fromAddress(srcAAddress) as PublicKey
    const mintAPublicKey = account.fromAddress(mintAAddress) as PublicKey
    const srcBPublicKey = account.fromAddress(srcBAddress) as PublicKey
    const mintBPublicKey = account.fromAddress(mintBAddress) as PublicKey
    const taxmanPublicKey = account.fromAddress(taxmanAddress) as PublicKey
    // Get treasurer
    const { treasurerAddress, treasurerPublicKey } = await this.getTreasurer(
      poolAddress,
    )
    // Get treasury A, B
    const [treasuryAPublicKey, treasuryBPublicKey] = (
      await this.deriveTreasuryAddresses(treasurerAddress, [
        mintAAddress,
        mintBAddress,
      ])
    ).map(
      (treasuryAddress) => account.fromAddress(treasuryAddress) as PublicKey,
    )
    // Generate proof
    const proofAddress = await this.genProofAddress(poolAddress)
    const proofPublicKey = account.fromAddress(proofAddress) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'delta_a', type: 'u64' },
        { key: 'delta_b', type: 'u64' },
      ],
      {
        code: 0,
        delta_a: deltaA,
        delta_b: deltaB,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: ownerPublicKey, isSigner: false, isWritable: false },
        { pubkey: pool.publicKey, isSigner: true, isWritable: true },
        { pubkey: lptPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintLPT.publicKey, isSigner: true, isWritable: true },
        { pubkey: taxmanPublicKey, isSigner: false, isWritable: false },
        { pubkey: proofPublicKey, isSigner: false, isWritable: false },

        { pubkey: srcAPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintAPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryAPublicKey, isSigner: false, isWritable: true },

        { pubkey: srcBPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintBPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryBPublicKey, isSigner: false, isWritable: true },

        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.swapProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Pretest / Rerun if the tx exceeds computation limit
    const ok = await this.pretestInitializePool(transaction)
    if (!ok)
      return await this.initializePool(
        deltaA,
        deltaB,
        ownerAddress,
        srcAAddress,
        srcBAddress,
        taxmanAddress,
        wallet,
      )
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    const poolSig = await this.selfSign(transaction, pool)
    this.addSignature(transaction, poolSig)
    const mintLPTSig = await this.selfSign(transaction, mintLPT)
    this.addSignature(transaction, mintLPTSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, mintLPTAddress, poolAddress, lptAddress }
  }

  /**
   * Initialize LPT
   * This function is rarely used. Any related accounts will be auto initialized by amm contract
   * @param mintLPTAddress
   * @param ownerAddress
   * @param wallet
   * @returns
   */
  initializeLPT = async (
    mintLPTAddress: string,
    ownerAddress: string,
    wallet: WalletInterface,
  ): Promise<{ accountAddress: string; txId: string }> => {
    return await this._splt.initializeAccount(
      mintLPTAddress,
      ownerAddress,
      wallet,
    )
  }

  /**
   * Add liquidity
   * @param deltaA Number of A will be deposited
   * @param deltaB Number of A will be deposited
   * @param poolAddress
   * @param srcAAddress
   * @param srcBAddress
   * @param wallet
   * @returns Transaction id, LPT address
   */
  addLiquidity = async (
    deltaA: bigint,
    deltaB: bigint,
    poolAddress: string,
    srcAAddress: string,
    srcBAddress: string,
    wallet: WalletInterface,
  ): Promise<{ lptAddress: string; txId: string }> => {
    // Validation
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    if (!account.isAddress(srcAAddress))
      throw new Error('Invalid source A address')
    if (!account.isAddress(srcBAddress))
      throw new Error('Invalid source B address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const {
      mint_lpt: mintLPTAddress,
      mint_a: mintAAddress,
      treasury_a: treasuryAAddress,
      mint_b: mintBAddress,
      treasury_b: treasuryBAddress,
    } = await this.getPoolData(poolAddress)
    const lptAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      mintLPTAddress,
    )
    if (!account.isAddress(lptAddress)) throw new Error('Invalid lpt address')
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const lptPublicKey = account.fromAddress(lptAddress) as PublicKey
    const mintLPTPublicKey = account.fromAddress(mintLPTAddress) as PublicKey
    const srcAPublicKey = account.fromAddress(srcAAddress) as PublicKey
    const mintAPublicKey = account.fromAddress(mintAAddress) as PublicKey
    const srcBPublicKey = account.fromAddress(srcBAddress) as PublicKey
    const mintBPublicKey = account.fromAddress(mintBAddress) as PublicKey
    // Get treasurer
    const { treasurerPublicKey } = await this.getTreasurer(poolAddress)
    // Get treasury S, A, B
    const [treasuryAPublicKey, treasuryBPublicKey] = [
      treasuryAAddress,
      treasuryBAddress,
    ].map(
      (treasuryAddress) => account.fromAddress(treasuryAddress) as PublicKey,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'delta_a', type: 'u64' },
        { key: 'delta_b', type: 'u64' },
      ],
      {
        code: 1,
        delta_a: deltaA,
        delta_b: deltaB,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: poolPublicKey, isSigner: false, isWritable: true },
        { pubkey: lptPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintLPTPublicKey, isSigner: false, isWritable: true },

        { pubkey: srcAPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintAPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryAPublicKey, isSigner: false, isWritable: true },

        { pubkey: srcBPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintBPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryBPublicKey, isSigner: false, isWritable: true },

        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.swapProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, lptAddress }
  }

  /**
   * Remove liquidity
   * @param lpt Number of lpt will be withdrawn
   * @param poolAddress
   * @param dstAAddress
   * @param dstBAddress
   * @param wallet
   * @returns Transaction id, LPT address
   */
  removeLiquidity = async (
    lpt: bigint,
    poolAddress: string,
    dstAAddress: string,
    dstBAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; lptAddress: string }> => {
    // Validation
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    if (!account.isAddress(dstAAddress))
      throw new Error('Invalid destination A address')
    if (!account.isAddress(dstBAddress))
      throw new Error('Invalid destination B address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const {
      mint_lpt: mintLPTAddress,
      mint_a: mintAAddress,
      treasury_a: treasuryAAddress,
      mint_b: mintBAddress,
      treasury_b: treasuryBAddress,
    } = await this.getPoolData(poolAddress)
    const lptAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      mintLPTAddress,
    )
    if (!account.isAddress(lptAddress)) throw new Error('Invalid lpt address')
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const lptPublicKey = account.fromAddress(lptAddress) as PublicKey
    const mintLPTPublicKey = account.fromAddress(mintLPTAddress) as PublicKey
    const dstAPublicKey = account.fromAddress(dstAAddress) as PublicKey
    const mintAPublicKey = account.fromAddress(mintAAddress) as PublicKey
    const dstBPublicKey = account.fromAddress(dstBAddress) as PublicKey
    const mintBPublicKey = account.fromAddress(mintBAddress) as PublicKey
    // Get treasurer
    const { treasurerPublicKey } = await this.getTreasurer(poolAddress)
    // Get treasury S, A, B
    const [treasuryAPublicKey, treasuryBPublicKey] = [
      treasuryAAddress,
      treasuryBAddress,
    ].map(
      (treasuryAddress) => account.fromAddress(treasuryAddress) as PublicKey,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'lpt', type: 'u64' },
      ],
      { code: 2, lpt },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: poolPublicKey, isSigner: false, isWritable: true },
        { pubkey: lptPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintLPTPublicKey, isSigner: false, isWritable: true },

        { pubkey: dstAPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintAPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryAPublicKey, isSigner: false, isWritable: true },

        { pubkey: dstBPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintBPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryBPublicKey, isSigner: false, isWritable: true },

        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.swapProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, lptAddress }
  }

  /**
   * Swap
   * @param amount Amount of biding tokens
   * @param limit The flooring amount of asking tokens
   * @param poolAddress
   * @param srcAddress
   * @param mintBidAddress
   * @param dstAddress
   * @param mintAskAddress
   * @param wallet
   * @returns
   */
  swap = async (
    amount: bigint,
    limit: bigint,
    poolAddress: string,
    srcAddress: string,
    dstAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation #1
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    // Fetch necessary info
    const poolData = await this.getPoolData(poolAddress)
    const { taxman: taxmanAddress } = poolData
    const { mint: srcMintAddress } = await this._splt.getAccountData(srcAddress)
    const { mint: dstMintAddress } = await this._splt.getAccountData(dstAddress)
    const treasuryTaxmanAddress = await this._splt.deriveAssociatedAddress(
      taxmanAddress,
      dstMintAddress,
    )
    // Validation #2
    if (!account.isAddress(taxmanAddress))
      throw new Error('Invalid taxman address')
    if (!account.isAddress(srcMintAddress))
      throw new Error('Invalid source mint address')
    if (!account.isAddress(dstMintAddress))
      throw new Error('Invalid destination mint address')
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const taxmanPublicKey = account.fromAddress(taxmanAddress) as PublicKey
    const srcPublicKey = account.fromAddress(srcAddress) as PublicKey
    const srcMintPublicKey = account.fromAddress(srcMintAddress) as PublicKey
    const dstPublicKey = account.fromAddress(dstAddress) as PublicKey
    const dstMintPublicKey = account.fromAddress(dstMintAddress) as PublicKey
    const treasuryTaxmanPublicKey = account.fromAddress(
      treasuryTaxmanAddress,
    ) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Get treasurer
    const { treasurerPublicKey } = await this.getTreasurer(poolAddress)
    // Get bid, ask treasury
    const [treasuryBidPublicKey, treasuryAskPublicKey] = [
      this.findTreasury(srcMintAddress, poolData),
      this.findTreasury(dstMintAddress, poolData),
    ].map(
      (treasuryAddress) => account.fromAddress(treasuryAddress) as PublicKey,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
        { key: 'limit', type: 'u64' },
      ],
      { code: 3, amount, limit },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: poolPublicKey, isSigner: false, isWritable: true },

        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcMintPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryBidPublicKey, isSigner: false, isWritable: true },

        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstMintPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryAskPublicKey, isSigner: false, isWritable: true },

        { pubkey: taxmanPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryTaxmanPublicKey, isSigner: false, isWritable: true },

        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.swapProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Freeze a pool
   * @param poolAddress
   * @param wallet
   * @returns
   */
  freezePool = async (
    poolAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 4,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: poolPublicKey, isSigner: false, isWritable: true },
      ],
      programId: this.swapProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Thaw pool
   * @param poolAddress
   * @param wallet
   * @returns
   */
  thawPool = async (
    poolAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 5,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: poolPublicKey, isSigner: false, isWritable: true },
      ],
      programId: this.swapProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Transfer taxman
   * @param poolAddress
   * @param newTaxmanAddress
   * @param wallet
   * @returns
   */
  transferTaxman = async (
    poolAddress: string,
    newTaxmanAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    if (!account.isAddress(newTaxmanAddress))
      throw new Error('Invalid new taxman address')
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const newTaxmanPublicKey = account.fromAddress(
      newTaxmanAddress,
    ) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 6,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: poolPublicKey, isSigner: false, isWritable: true },
        { pubkey: newTaxmanPublicKey, isSigner: false, isWritable: false },
      ],
      programId: this.swapProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Close LPT account
   * @param lptAddress
   * @param wallet
   * @returns Transaction id
   */
  closeLPT = async (
    lptAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: String }> => {
    return await this._splt.closeAccount(lptAddress, wallet)
  }

  /**
   * Transfer pool's ownership
   * @param poolAddress
   * @param newOwnerAddress
   * @param wallet
   * @returns
   */
  transferPoolOwnership = async (
    poolAddress: string,
    newOwnerAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    if (!account.isAddress(newOwnerAddress))
      throw new Error('Invalid new owner address')
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const newOwnerPublicKey = account.fromAddress(newOwnerAddress) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 7,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: poolPublicKey, isSigner: false, isWritable: true },
        { pubkey: newOwnerPublicKey, isSigner: false, isWritable: false },
      ],
      programId: this.swapProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  routing = async (
    amount: bigint,
    limit: bigint,
    routingAddress: Array<RoutingAddress>,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey

    const keys = new Array<AccountMeta>()
    keys.push({ pubkey: payerPublicKey, isSigner: true, isWritable: false })
    keys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false })
    keys.push({ pubkey: this.spltProgramId, isSigner: false, isWritable: false })
    keys.push({ pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false })
    keys.push({ pubkey: this.splataProgramId, isSigner: false, isWritable: false })

    for (const ra of routingAddress) {
      const poolAddress = ra.poolAddress
      if (!account.isAddress(poolAddress)) throw ProgramError.InvalidAddressErr
      const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
      const { treasurerPublicKey } = await this.getTreasurer(poolAddress)
      const poolData = await this.getPoolData(poolAddress)
      const { taxman: taxmanAddress } = poolData
      if (!account.isAddress(taxmanAddress)) throw ProgramError.InvalidTaxmanAddressErr
      const taxmanPublicKey = account.fromAddress(taxmanAddress) as PublicKey

      const srcAddress = ra.srcAddress
      if (!account.isAddress(srcAddress)) throw ProgramError.InvalidAddressErr
      const srcPublicKey = account.fromAddress(srcAddress) as PublicKey
      const { mint: srcMintAddress } = await this._splt.getAccountData(srcAddress)
      if (!account.isAddress(srcMintAddress)) throw ProgramError.InvalidSourceMintAddressErr
      const srcMintPublicKey = account.fromAddress(srcMintAddress) as PublicKey

      const dstAddress = ra.dstAddress
      if (!account.isAddress(dstAddress)) throw  ProgramError.InvalidAddressErr
      const dstPublicKey = account.fromAddress(dstAddress) as PublicKey
      const { mint: dstMintAddress } = await this._splt.getAccountData(dstAddress)
      if (!account.isAddress(dstMintAddress)) throw ProgramError.InvalidDestinationMintAddressErr
      const dstMintPublicKey = account.fromAddress(dstMintAddress) as PublicKey

      const treasuryTaxmanAddress = await this._splt.deriveAssociatedAddress(taxmanAddress, dstMintAddress)
      const treasuryTaxmanPublicKey = account.fromAddress(treasuryTaxmanAddress) as PublicKey

      const [treasuryBidPublicKey, treasuryAskPublicKey] = [
        this.findTreasury(srcMintAddress, poolData),
        this.findTreasury(dstMintAddress, poolData),
      ].map(
        (treasuryAddress) => account.fromAddress(treasuryAddress) as PublicKey,
      )

      keys.push({ pubkey: poolPublicKey, isSigner: false, isWritable: true })

      keys.push({ pubkey: srcPublicKey, isSigner: false, isWritable: true })
      keys.push({ pubkey: srcMintPublicKey, isSigner: false, isWritable: false })
      keys.push({ pubkey: treasuryBidPublicKey, isSigner: false, isWritable: true })

      keys.push({ pubkey: dstPublicKey, isSigner: false, isWritable: true })
      keys.push({ pubkey: dstMintPublicKey, isSigner: false, isWritable: false })
      keys.push({ pubkey: treasuryAskPublicKey, isSigner: false, isWritable: true })

      keys.push({ pubkey: taxmanPublicKey, isSigner: false, isWritable: false })
      keys.push({ pubkey: treasuryTaxmanPublicKey, isSigner: false, isWritable: true })

      keys.push({ pubkey: treasurerPublicKey, isSigner: false, isWritable: false })
    }

    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
        { key: 'limit', type: 'u64' },
      ],
      {
        code: CodeInstruction.Routing.valueOf(),
        amount,
        limit,
      },
    )
    const instruction = new TransactionInstruction({
      keys: keys,
      programId: this.swapProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }
}

export default Swap
