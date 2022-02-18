import { SwapProgram } from './../anchor/sentre/swapProgram'
import { SentreProgram } from './../anchor/sentre/index'
import {
  PublicKey,
  Transaction,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  SystemProgram,
  GetProgramAccountsFilter,
  KeyedAccountInfo,
  AccountMeta,
} from '@solana/web3.js'

import Tx from '../core/tx'
import SPLT from '../splt'
import account from '../account'
import schema, { AccountData, PoolData } from '../schema'
import {
  DEFAULT_SWAP_PROGRAM_ADDRESS,
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_WSOL,
} from '../default'
import { WalletInterface } from '../rawWallet'
import oracle from './oracle'
import { InstructionCode } from './constant'
import { Program, Provider, web3, BN } from '@project-serum/anchor'
import { getAnchorProvider } from '../anchor/sentre/anchorProvider'

const soproxABI = require('soprox-abi')
const xor = require('buffer-xor')

export type SwapAccountChangeInfo = {
  type: 'pool'
  address: string
  data: Buffer
}
export type RoutingAddress = {
  poolAddress: string
  srcAddress: string
  dstAddress: string
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
  'Frozen pool',
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
    this.swapProgramId = account.fromAddress(swapProgramAddress)
    this.spltProgramId = account.fromAddress(spltProgramAddress)
    this.splataProgramId = account.fromAddress(splataProgramAddress)

    this._splt = new SPLT(spltProgramAddress, splataProgramAddress, nodeUrl)
  }

  async getSwapProgram(wallet?: WalletInterface) {
    const anchorProvider = await getAnchorProvider(
      this._splt.connection,
      wallet,
    )
    const swapProgram: Program<SwapProgram> = SentreProgram.swap(anchorProvider)
    return swapProgram
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
    const poolPublicKey = account.fromAddress(poolAddress)
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

    const mintAuthorityPublicKey = account.fromAddress(mintAuthorityAddress)
    const freezeAuthorityPublicKey = account.fromAddress(freezeAuthorityAddress) // Proof address of mint LPT
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
   * Infer mint addresses by account addresses from pool data
   * @param accountAddresses
   * @returns
   */
  private inferMintAddresses = async (
    accountAddresses: Array<string>,
    walletAddress: string,
    poolData: PoolData,
  ): Promise<Array<string>> => {
    const { mint_a: mintAAddress, mint_b: mintBAddress } = poolData
    const accountAAddress = await this._splt.deriveAssociatedAddress(
      walletAddress,
      mintAAddress,
    )
    const accountBAddress = await this._splt.deriveAssociatedAddress(
      walletAddress,
      mintBAddress,
    )
    if (
      JSON.stringify(accountAddresses) ===
      JSON.stringify([accountAAddress, accountBAddress])
    )
      return [mintAAddress, mintBAddress]
    else if (
      JSON.stringify(accountAddresses) ===
      JSON.stringify([accountBAddress, accountAAddress])
    )
      return [mintBAddress, mintAAddress]
    else throw new Error('Cannot match mint addresses in pool')
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
    const poolPublicKey = account.fromAddress(poolAddress)

    const swapProgram = await this.getSwapProgram()
    const data = await swapProgram.account.pool.fetch(poolPublicKey)
    console.log(' ??==>', {
      owner: data.owner.toBase58(),
      mint_lpt: data.mint_lpt.toBase58(),
      treasury_a: data.treasury_a.toBase58(),
      reserve_a: data.reserve_a.toNumber(),
      tax_ratio: data.tax_ratio.toNumber(),
    })

    if (!data) throw new Error('Invalid pool address')
    return data as any
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
    const lptPublicKey = account.fromAddress(lptAddress)
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
    return { ...lptData, pool: poolAddress }
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
   * @param fee Fee (10^8 precision)
   * @param tax Tax (10^8 precision)
   * @param ownerAddress Pool owner address
   * @param srcAAddress A source address
   * @param srcBAddress B source address
   * @param taxmanAddress Foundation SEN account address
   * @param wallet
   * @returns Transaction id, pool address, mint LPT address, lpt address
   */
  initializePool = async (
    deltaA: BN,
    deltaB: BN,
    feeRatio: BN,
    taxRatio: BN,
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

    // Get swapProgram
    const swapProgram = await this.getSwapProgram(wallet)

    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
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
    const ownerPublicKey = account.fromAddress(ownerAddress)
    const lptPublicKey = account.fromAddress(lptAddress)
    const srcAPublicKey = account.fromAddress(srcAAddress)
    const mintAPublicKey = account.fromAddress(mintAAddress)
    const srcBPublicKey = account.fromAddress(srcBAddress)
    const mintBPublicKey = account.fromAddress(mintBAddress)
    const taxmanPublicKey = account.fromAddress(taxmanAddress)
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
    ).map((treasuryAddress) => account.fromAddress(treasuryAddress))
    // Generate proof
    const proofAddress = await this.genProofAddress(poolAddress)
    const proofPublicKey = account.fromAddress(proofAddress)

    const txId = await swapProgram.rpc.initializePool(
      deltaA,
      deltaB,
      feeRatio,
      taxRatio,
      {
        accounts: {
          payerPublicKey,
          ownerPublicKey,
          poolPublicKey: pool.publicKey,
          lptPublicKey: lptPublicKey,
          mintLptPublicKey: mintLPT.publicKey,
          taxmanPublicKey,
          proofPublicKey,

          srcAPublicKey,
          mintAPublicKey,
          treasuryAPublicKey,
          srcBPublicKey,
          mintBPublicKey,
          treasuryBPublicKey,
          treasurerPublicKey,
          //
          systemProgram: SystemProgram.programId,
          spltProgramId: new PublicKey(DEFAULT_SPLT_PROGRAM_ADDRESS),
          rent: web3.SYSVAR_RENT_PUBKEY,
          splataProgramId: new PublicKey(DEFAULT_SPLATA_PROGRAM_ADDRESS),
        },
        signers: [pool, mintLPT],
      },
    )
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
   * @param deltaB Number of B will be deposited
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
    const payerPublicKey = account.fromAddress(payerAddress)
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
    const poolPublicKey = account.fromAddress(poolAddress)
    const lptPublicKey = account.fromAddress(lptAddress)
    const mintLPTPublicKey = account.fromAddress(mintLPTAddress)
    const srcAPublicKey = account.fromAddress(srcAAddress)
    const mintAPublicKey = account.fromAddress(mintAAddress)
    const srcBPublicKey = account.fromAddress(srcBAddress)
    const mintBPublicKey = account.fromAddress(mintBAddress)
    // Get treasurer
    const { treasurerPublicKey } = await this.getTreasurer(poolAddress)
    // Get treasury S, A, B
    const [treasuryAPublicKey, treasuryBPublicKey] = [
      treasuryAAddress,
      treasuryBAddress,
    ].map((treasuryAddress) => account.fromAddress(treasuryAddress))
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
        code: InstructionCode.AddLiquidity.valueOf(),
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
    const payerPublicKey = account.fromAddress(payerAddress)
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
    const poolPublicKey = account.fromAddress(poolAddress)
    const lptPublicKey = account.fromAddress(lptAddress)
    const mintLPTPublicKey = account.fromAddress(mintLPTAddress)
    const dstAPublicKey = account.fromAddress(dstAAddress)
    const mintAPublicKey = account.fromAddress(mintAAddress)
    const dstBPublicKey = account.fromAddress(dstBAddress)
    const mintBPublicKey = account.fromAddress(mintBAddress)
    // Get treasurer
    const { treasurerPublicKey } = await this.getTreasurer(poolAddress)
    // Get treasury S, A, B
    const [treasuryAPublicKey, treasuryBPublicKey] = [
      treasuryAAddress,
      treasuryBAddress,
    ].map((treasuryAddress) => account.fromAddress(treasuryAddress))
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'lpt', type: 'u64' },
      ],
      { code: InstructionCode.RemoveLiquidity.valueOf(), lpt },
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
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const poolData = await this.getPoolData(poolAddress)
    const { taxman: taxmanAddress } = poolData
    const [srcMintAddress, dstMintAddress] = await this.inferMintAddresses(
      [srcAddress, dstAddress],
      payerAddress,
      poolData,
    )
    const treasuryTaxmanAddress = await this._splt.deriveAssociatedAddress(
      taxmanAddress,
      dstMintAddress,
    )
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress)
    const taxmanPublicKey = account.fromAddress(taxmanAddress)
    const srcPublicKey = account.fromAddress(srcAddress)
    const srcMintPublicKey = account.fromAddress(srcMintAddress)
    const dstPublicKey = account.fromAddress(dstAddress)
    const dstMintPublicKey = account.fromAddress(dstMintAddress)
    const treasuryTaxmanPublicKey = account.fromAddress(treasuryTaxmanAddress)
    // Get treasurer
    const { treasurerPublicKey } = await this.getTreasurer(poolAddress)
    // Get bid, ask treasury
    const [treasuryBidPublicKey, treasuryAskPublicKey] = [
      this.findTreasury(srcMintAddress, poolData),
      this.findTreasury(dstMintAddress, poolData),
    ].map((treasuryAddress) => account.fromAddress(treasuryAddress))
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
        { key: 'limit', type: 'u64' },
      ],
      { code: InstructionCode.Swap.valueOf(), amount, limit },
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
    const poolPublicKey = account.fromAddress(poolAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: InstructionCode.FreezePool.valueOf(),
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
    const poolPublicKey = account.fromAddress(poolAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: InstructionCode.ThawPool.valueOf(),
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
    const poolPublicKey = account.fromAddress(poolAddress)
    const newTaxmanPublicKey = account.fromAddress(newTaxmanAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: InstructionCode.TransferTaxman.valueOf(),
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
    const poolPublicKey = account.fromAddress(poolAddress)
    const newOwnerPublicKey = account.fromAddress(newOwnerAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: InstructionCode.TransferOwnership.valueOf(),
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

  /**
   * Route
   * @param amount that's mean amount of biding tokens
   * @param limit that's mean the flooring amount of asking tokens
   * @param routingAddress is array of RoutingAddress include in poolAddress, srcAddress and dstAddress
   * @param wallet
   */
  route = async (
    amount: bigint,
    limit: bigint,
    routingAddress: Array<RoutingAddress>,
    wallet: WalletInterface,
  ): Promise<{ txId: string; dst: string }> => {
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Pre-build system accounts
    const keys = new Array<AccountMeta>()
    keys.push({ pubkey: payerPublicKey, isSigner: true, isWritable: false })
    keys.push({
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    })
    keys.push({
      pubkey: this.spltProgramId,
      isSigner: false,
      isWritable: false,
    })
    keys.push({
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    })
    keys.push({
      pubkey: this.splataProgramId,
      isSigner: false,
      isWritable: false,
    })
    // Build accounts
    for (const { poolAddress, srcAddress, dstAddress } of routingAddress) {
      if (!account.isAddress(poolAddress))
        throw new Error('Invalid pool address')
      if (!account.isAddress(srcAddress))
        throw new Error('Invalid source address')
      if (!account.isAddress(dstAddress))
        throw new Error('Invalid destination address')
      // Fetch necessary info
      const poolData = await this.getPoolData(poolAddress)
      const { taxman: taxmanAddress } = poolData
      const [srcMintAddress, dstMintAddress] = await this.inferMintAddresses(
        [srcAddress, dstAddress],
        payerAddress,
        poolData,
      )
      const treasuryTaxmanAddress = await this._splt.deriveAssociatedAddress(
        taxmanAddress,
        dstMintAddress,
      )
      // Build public keys
      const poolPublicKey = account.fromAddress(poolAddress)
      const taxmanPublicKey = account.fromAddress(taxmanAddress)
      const srcPublicKey = account.fromAddress(srcAddress)
      const srcMintPublicKey = account.fromAddress(srcMintAddress)
      const dstPublicKey = account.fromAddress(dstAddress)
      const dstMintPublicKey = account.fromAddress(dstMintAddress)
      const treasuryTaxmanPublicKey = account.fromAddress(treasuryTaxmanAddress)
      // Get treasurer
      const { treasurerPublicKey } = await this.getTreasurer(poolAddress)
      // Get bid, ask treasury
      const [treasuryBidPublicKey, treasuryAskPublicKey] = [
        this.findTreasury(srcMintAddress, poolData),
        this.findTreasury(dstMintAddress, poolData),
      ].map((treasuryAddress) => account.fromAddress(treasuryAddress))
      // Add keys
      keys.push({ pubkey: poolPublicKey, isSigner: false, isWritable: true })
      keys.push({ pubkey: srcPublicKey, isSigner: false, isWritable: true })
      keys.push({
        pubkey: srcMintPublicKey,
        isSigner: false,
        isWritable: false,
      })
      keys.push({
        pubkey: treasuryBidPublicKey,
        isSigner: false,
        isWritable: true,
      })
      keys.push({ pubkey: dstPublicKey, isSigner: false, isWritable: true })
      keys.push({
        pubkey: dstMintPublicKey,
        isSigner: false,
        isWritable: false,
      })
      keys.push({
        pubkey: treasuryAskPublicKey,
        isSigner: false,
        isWritable: true,
      })
      keys.push({ pubkey: taxmanPublicKey, isSigner: false, isWritable: false })
      keys.push({
        pubkey: treasuryTaxmanPublicKey,
        isSigner: false,
        isWritable: true,
      })
      keys.push({
        pubkey: treasurerPublicKey,
        isSigner: false,
        isWritable: false,
      })
    }
    // Build transaction
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
        { key: 'limit', type: 'u64' },
      ],
      {
        code: InstructionCode.Routing.valueOf(),
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
    const dst = routingAddress[routingAddress.length - 1].poolAddress
    return { txId, dst }
  }

  /**
   * Update fee & tax
   * @param feeRatio Fee (10^8 precision)
   * @param taxRatio Tax (10^8 precision)
   * @param poolAddress
   * @param wallet
   * @returns
   */
  updateFee = async (
    feeRatio: bigint,
    taxRatio: bigint,
    poolAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    const poolPublicKey = account.fromAddress(poolAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'fee_ratio', type: 'u64' },
        { key: 'tax_ratio', type: 'u64' },
      ],
      {
        code: InstructionCode.UpdateFee.valueOf(),
        fee_ratio: feeRatio,
        tax_ratio: taxRatio,
      },
    )
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
   * Add sided liquidity
   * @param deltaA Number of A will be deposited
   * @param deltaB Number of B will be deposited
   * @param poolAddress
   * @param srcAAddress
   * @param srcBAddress
   * @param wallet
   * @returns Transaction id, LPT address
   */
  addSidedLiquidity = async (
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
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const {
      mint_lpt: mintLPTAddress,
      mint_a: mintAAddress,
      treasury_a: treasuryAAddress,
      mint_b: mintBAddress,
      treasury_b: treasuryBAddress,
      taxman: taxmanAddress,
    } = await this.getPoolData(poolAddress)
    const lptAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      mintLPTAddress,
    )
    const [treasuryTaxmanAAddress, treasuryTaxmanBAddress] =
      await this.deriveTreasuryAddresses(taxmanAddress, [
        mintAAddress,
        mintBAddress,
      ])
    if (!account.isAddress(lptAddress)) throw new Error('Invalid lpt address')
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress)
    const lptPublicKey = account.fromAddress(lptAddress)
    const mintLPTPublicKey = account.fromAddress(mintLPTAddress)
    const srcAPublicKey = account.fromAddress(srcAAddress)
    const mintAPublicKey = account.fromAddress(mintAAddress)
    const srcBPublicKey = account.fromAddress(srcBAddress)
    const mintBPublicKey = account.fromAddress(mintBAddress)
    const taxmanPublicKey = account.fromAddress(taxmanAddress)
    const treasuryTaxmanAPublicKey = account.fromAddress(treasuryTaxmanAAddress)
    const treasuryTaxmanBPublicKey = account.fromAddress(treasuryTaxmanBAddress)
    // Get treasurer
    const { treasurerPublicKey } = await this.getTreasurer(poolAddress)
    // Get treasury S, A, B
    const [treasuryAPublicKey, treasuryBPublicKey] = [
      treasuryAAddress,
      treasuryBAddress,
    ].map((treasuryAddress) => account.fromAddress(treasuryAddress))
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
        code: InstructionCode.AddSidedLiquidity.valueOf(),
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

        { pubkey: taxmanPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryTaxmanAPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryTaxmanBPublicKey, isSigner: false, isWritable: true },

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
   * Wrap sol
   */
  wrapSol = async (
    amount: bigint,
    wallet: WalletInterface,
  ): Promise<{ accountAddress: string; txId: string }> => {
    // Validation
    if (amount < 0n) throw new Error('Invalid amount')
    // Get payer & associated account
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    const accountAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      DEFAULT_WSOL,
    )
    const accountPublicKey = account.fromAddress(accountAddress)
    const mintPublicKey = account.fromAddress(DEFAULT_WSOL)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: InstructionCode.WrapSol.valueOf(), amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: accountPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintPublicKey, isSigner: false, isWritable: false },
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
    return { accountAddress, txId }
  }
}

export default Swap
