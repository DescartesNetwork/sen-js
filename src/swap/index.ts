import {
  PublicKey,
  Transaction,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  SystemProgram,
  GetProgramAccountsFilter,
  KeyedAccountInfo,
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
import { WalletInterface } from '../wallet/baseWallet'
import oracle from './oracle'

const soproxABI = require('soprox-abi')
const xor = require('buffer-xor')

export type SwapAccountChangeInfo = {
  type: 'pool'
  address: string
  data: Buffer
}

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
    super(nodeUrl)

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
   * The splt mints is seperated to nomeral mints by its freeze authority
   * The splt mints' freeze authority is assigned to the proof address
   * @param poolAddress
   * @returns A corresponding proof address to a pool address
   */
  private genProofAddress = async (poolAddress: string): Promise<string> => {
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const seed = [poolPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.swapProgramId,
    )
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
  ): Promise<string | null> => {
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
    const seed = [poolPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.swapProgramId,
    )
    if (treasurerPublicKey.toBase58() != mintAuthorityPublicKey.toBase58())
      return null
    return poolPublicKey.toBase58()
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
   * Derive lpt address
   * @param mintLPTAddress
   * @param wallet
   * @param autoCreating
   * @returns
   */
  private deriveLPTAddress = async (
    mintLPTAddress: string,
    wallet: WalletInterface,
    autoCreating = true,
  ): Promise<string> => {
    const payerAddress = await wallet.getAddress()
    const lptAddress = await account.deriveAssociatedAddress(
      payerAddress,
      mintLPTAddress,
      this.spltProgramId.toBase58(),
      this.splataProgramId.toBase58(),
    )
    try {
      await this.getLPTData(lptAddress)
      return lptAddress
    } catch (er) {
      if (!autoCreating) throw new Error(er)
      await this.initializeLPT(lptAddress, mintLPTAddress, wallet)
      return lptAddress
    }
  }

  /**
   * Parse pool buffer data
   * @param poolAddress
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
    let result = { address: poolAddress }
    const { data } = (await this.connection.getAccountInfo(poolPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${result.address}`)
    return this.parsePoolData(data)
  }

  /**
   * Get lpt data (Indentical to get account (SPLT) data)
   * @param lptAddress
   * @returns
   */
  getLPTData = async (lptAddress: string): Promise<AccountData> => {
    return await this._splt.getAccountData(lptAddress)
  }

  /**
   * Initialize a swap pool
   * @param reserveS Number of SEN
   * @param reserveA Number of A (then first token)
   * @param reserveB Number of B (then second token)
   * @param ownerAddress Pool owner address
   * @param srcSAddress SEN source address
   * @param srcAAddress A source address
   * @param srcBAddress B source address
   * @param wallet
   * @returns Transaction id, pool address, mint LPT address, lpt address, vault address
   */
  initializePool = async (
    reserveS: bigint,
    reserveA: bigint,
    reserveB: bigint,
    ownerAddress: string,
    srcSAddress: string,
    srcAAddress: string,
    srcBAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    mintLPTAddress: string
    vaultAddress: string
    poolAddress: string
    lptAddress: string
  }> => {
    // Validation #1
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    if (!account.isAddress(srcSAddress))
      throw new Error('Invalid source S address')
    if (!account.isAddress(srcAAddress))
      throw new Error('Invalid source A address')
    if (!account.isAddress(srcBAddress))
      throw new Error('Invalid source B address')
    // Fetch necessary info
    const mintLPT = account.createAccount()
    const mintLPTAddress = mintLPT.publicKey.toBase58()
    const vault = account.createAccount()
    const vaultAddress = vault.publicKey.toBase58()
    const pool = await account.createStrictAccount(this.swapProgramId)
    const poolAddress = pool.publicKey.toBase58()
    const lptAddress = await account.deriveAssociatedAddress(
      ownerAddress,
      mintLPTAddress,
      this.spltProgramId.toBase58(),
      this.splataProgramId.toBase58(),
    )
    const { mint: mintSAddress } = await this._splt.getAccountData(srcSAddress)
    const { mint: mintAAddress } = await this._splt.getAccountData(srcAAddress)
    const { mint: mintBAddress } = await this._splt.getAccountData(srcBAddress)
    // Validation #2
    if (!account.isAddress(lptAddress)) throw new Error('Invalid lpt address')
    if (!account.isAddress(mintSAddress))
      throw new Error('Invalid mint S address')
    if (!account.isAddress(mintAAddress))
      throw new Error('Invalid mint A address')
    if (!account.isAddress(mintBAddress))
      throw new Error('Invalid mint B address')
    // Build public keys
    const ownerPublicKey = account.fromAddress(ownerAddress) as PublicKey
    const lptPublicKey = account.fromAddress(lptAddress) as PublicKey
    const srcSPublicKey = account.fromAddress(srcSAddress) as PublicKey
    const mintSPublicKey = account.fromAddress(mintSAddress) as PublicKey
    const srcAPublicKey = account.fromAddress(srcAAddress) as PublicKey
    const mintAPublicKey = account.fromAddress(mintAAddress) as PublicKey
    const srcBPublicKey = account.fromAddress(srcBAddress) as PublicKey
    const mintBPublicKey = account.fromAddress(mintBAddress) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Get treasurer
    const seed = [pool.publicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.swapProgramId,
    )
    const treasurerAddress = treasurerPublicKey.toBase58()
    // Get treasury S, A, B
    const [treasurySPublicKey, treasuryAPublicKey, treasuryBPublicKey] = (
      await this.deriveTreasuryAddresses(treasurerAddress, [
        mintSAddress,
        mintAAddress,
        mintBAddress,
      ])
    ).map(
      (treasuryAddress) => account.fromAddress(treasuryAddress) as PublicKey,
    )
    // Rent pool
    const poolSpace = new soproxABI.struct(schema.POOL_SCHEMA).space
    await this.rentAccount(wallet, pool, poolSpace, this.swapProgramId)
    // Rent mint
    const mintSpace = new soproxABI.struct(schema.MINT_SCHEMA).space
    await this.rentAccount(wallet, mintLPT, mintSpace, this.spltProgramId)
    // Rent vault
    const accountSpace = new soproxABI.struct(schema.ACCOUNT_SCHEMA).space
    await this.rentAccount(wallet, vault, accountSpace, this.spltProgramId)
    // Generate proof
    const proofAddress = await this.genProofAddress(poolAddress)
    const proofPublicKey = account.fromAddress(proofAddress) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'reserve_s', type: 'u64' },
        { key: 'reserve_a', type: 'u64' },
        { key: 'reserve_b', type: 'u64' },
      ],
      {
        code: 0,
        reserve_s: reserveS,
        reserve_a: reserveA,
        reserve_b: reserveB,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: ownerPublicKey, isSigner: false, isWritable: false },
        { pubkey: pool.publicKey, isSigner: true, isWritable: true },
        { pubkey: lptPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintLPT.publicKey, isSigner: false, isWritable: true },
        { pubkey: vault.publicKey, isSigner: true, isWritable: true },
        { pubkey: proofPublicKey, isSigner: false, isWritable: false },

        { pubkey: srcSPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintSPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasurySPublicKey, isSigner: false, isWritable: true },

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
    const poolSig = await this.selfSign(transaction, pool)
    this.addSignature(transaction, poolSig)
    const vaultSig = await this.selfSign(transaction, vault)
    this.addSignature(transaction, vaultSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, mintLPTAddress, vaultAddress, poolAddress, lptAddress }
  }

  /**
   * Initialize LPT
   * @param lptAccountOrAddress
   * @param mintLPTAddress
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
   * @param deltaS Number of SEN will be deposited
   * @param deltaA Number of A will be deposited
   * @param deltaB Number of A will be deposited
   * @param poolAddress
   * @param srcSAddress
   * @param srcAAddress
   * @param srcBAddress
   * @param wallet
   * @returns Transaction id, LPT address
   */
  addLiquidity = async (
    deltaS: bigint,
    deltaA: bigint,
    deltaB: bigint,
    poolAddress: string,
    srcSAddress: string,
    srcAAddress: string,
    srcBAddress: string,
    wallet: WalletInterface,
  ): Promise<{ lptAddress: string; txId: string }> => {
    // Validation #1
    if (!account.isAddress(srcSAddress))
      throw new Error('Invalid source S address')
    if (!account.isAddress(srcAAddress))
      throw new Error('Invalid source A address')
    if (!account.isAddress(srcBAddress))
      throw new Error('Invalid source B address')
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    // Fetch necessary info
    const data = await this.getPoolData(poolAddress)
    const {
      mint_lpt: mintLPTAddress,
      mint_s: mintSAddress,
      mint_a: mintAAddress,
      mint_b: mintBAddress,
    } = data
    const lptAddress = await this.deriveLPTAddress(mintLPTAddress, wallet, true)
    // validation #2
    if (!account.isAddress(lptAddress)) throw new Error('Invalid lpt address')
    if (!account.isAddress(mintLPTAddress))
      throw new Error('Invalid mint LPT address')
    if (!account.isAddress(mintSAddress))
      throw new Error('Invalid mint S address')
    if (!account.isAddress(mintAAddress))
      throw new Error('Invalid mint A address')
    if (!account.isAddress(mintBAddress))
      throw new Error('Invalid mint B address')
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const lptPublicKey = account.fromAddress(lptAddress) as PublicKey
    const mintLPTPublicKey = account.fromAddress(mintLPTAddress) as PublicKey
    const srcSPublicKey = account.fromAddress(srcSAddress) as PublicKey
    const srcAPublicKey = account.fromAddress(srcAAddress) as PublicKey
    const srcBPublicKey = account.fromAddress(srcBAddress) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Get treasurer
    const seed = [poolPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.swapProgramId,
    )
    const treasurerAddress = treasurerPublicKey.toBase58()
    // Get treasury S, A, B
    const [treasurySPublicKey, treasuryAPublicKey, treasuryBPublicKey] = (
      await this.deriveTreasuryAddresses(treasurerAddress, [
        mintSAddress,
        mintAAddress,
        mintBAddress,
      ])
    ).map(
      (treasuryAddress) => account.fromAddress(treasuryAddress) as PublicKey,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'delta_s', type: 'u64' },
        { key: 'delta_a', type: 'u64' },
        { key: 'delta_b', type: 'u64' },
      ],
      {
        code: 1,
        delta_s: deltaS,
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

        { pubkey: srcSPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurySPublicKey, isSigner: false, isWritable: true },

        { pubkey: srcAPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryAPublicKey, isSigner: false, isWritable: true },

        { pubkey: srcBPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryBPublicKey, isSigner: false, isWritable: true },

        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
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
   * @param dstSAddress
   * @param dstAAddress
   * @param dstBAddress
   * @param wallet
   * @returns Transaction id, LPT address
   */
  removeLiquidity = async (
    lpt: bigint,
    poolAddress: string,
    dstSAddress: string,
    dstAAddress: string,
    dstBAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; lptAddress: string }> => {
    // Validation #1
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    if (!account.isAddress(dstSAddress))
      throw new Error('Invalid destination S address')
    if (!account.isAddress(dstAAddress))
      throw new Error('Invalid destination A address')
    if (!account.isAddress(dstBAddress))
      throw new Error('Invalid destination B address')
    // Fetch necessary info
    const {
      mint_lpt: mintLPTAddress,
      mint_s: mintSAddress,
      mint_a: mintAAddress,
      mint_b: mintBAddress,
    } = await this.getPoolData(poolAddress)
    const lptAddress = await this.deriveLPTAddress(
      mintLPTAddress,
      wallet,
      false,
    )
    // Validation #2
    if (!account.isAddress(lptAddress)) throw new Error('Invalid lpt address')
    if (!account.isAddress(mintLPTAddress))
      throw new Error('Invalid mint LPT address')
    if (!account.isAddress(mintSAddress))
      throw new Error('Invalid mint S address')
    if (!account.isAddress(mintAAddress))
      throw new Error('Invalid mint A address')
    if (!account.isAddress(mintBAddress))
      throw new Error('Invalid mint B address')
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const lptPublicKey = account.fromAddress(lptAddress) as PublicKey
    const mintLPTPublicKey = account.fromAddress(mintLPTAddress) as PublicKey
    const dstSPublicKey = account.fromAddress(dstSAddress) as PublicKey
    const dstAPublicKey = account.fromAddress(dstAAddress) as PublicKey
    const dstBPublicKey = account.fromAddress(dstBAddress) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Get treasurer
    const seed = [poolPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.swapProgramId,
    )
    const treasurerAddress = treasurerPublicKey.toBase58()
    // Get treasury S, A, B
    const [treasurySPublicKey, treasuryAPublicKey, treasuryBPublicKey] = (
      await this.deriveTreasuryAddresses(treasurerAddress, [
        mintSAddress,
        mintAAddress,
        mintBAddress,
      ])
    ).map(
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
        { pubkey: dstSPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurySPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstAPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryAPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstBPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryBPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
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
    const { vault: vaultAddress, treasury_s: treasurySAddress } =
      await this.getPoolData(poolAddress)
    const { mint: srcMintAddress } = await this._splt.getAccountData(srcAddress)
    const { mint: dstMintAddress } = await this._splt.getAccountData(dstAddress)
    // Validation #2
    if (!account.isAddress(vaultAddress))
      throw new Error('Invalid vault address')
    if (!account.isAddress(treasurySAddress))
      throw new Error('Invalid treasury sen address')
    if (!account.isAddress(srcMintAddress))
      throw new Error('Invalid source mint address')
    if (!account.isAddress(dstMintAddress))
      throw new Error('Invalid destination mint address')
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const vaultPublicKey = account.fromAddress(vaultAddress) as PublicKey
    const srcPublicKey = account.fromAddress(srcAddress) as PublicKey
    const dstPublicKey = account.fromAddress(dstAddress) as PublicKey
    const treasurySPublicKey = account.fromAddress(
      treasurySAddress,
    ) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Get treasurer
    const seed = [poolPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.swapProgramId,
    )
    const treasurerAddress = treasurerPublicKey.toBase58()
    // Get bid, ask treasury
    const [treasuryBidPublicKey, treasuryAskPublicKey] = (
      await this.deriveTreasuryAddresses(treasurerAddress, [
        srcMintAddress,
        dstMintAddress,
      ])
    ).map(
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
        { pubkey: vaultPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryBidPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryAskPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurySPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
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
   * Withdraw the protocol charge in vault
   * @param amount
   * @param poolAddress
   * @param dstAddress
   * @param wallet
   * @returns
   */
  earn = async (
    amount: bigint,
    poolAddress: string,
    dstAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation #1
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    // Fetch necessary info
    const { vault: vaultAddress } = await this.getPoolData(poolAddress)
    // Validation #2
    if (!account.isAddress(vaultAddress))
      throw new Error('Invalid vault address')
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const vaultPublicKey = account.fromAddress(vaultAddress) as PublicKey
    const dstPublicKey = account.fromAddress(dstAddress) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Get treasurer
    const seed = [poolPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.swapProgramId,
    )
    // build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: 6, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: poolPublicKey, isSigner: false, isWritable: false },
        { pubkey: vaultPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
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
}

export default Swap
