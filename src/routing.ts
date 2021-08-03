import {
  PublicKey,
  Transaction,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js'

import Tx from './core/tx'
import account from './account'
import {
  DEFAULT_SWAP_PROGRAM_ADDRESS,
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_ROUTING_PROGRAM_ADDRESS,
} from './default'
import { WalletInterface } from './rawWallet'
import Swap from './swap'
import { PoolData } from './schema'

const soproxABI = require('soprox-abi')

const ErrorMapping = [
  'Invalid instruction',
  'Incorrect program id',
  'Operation overflowed',
  'The primary mints is unmatched in pools',
  'Cannot find reserves',
]

class Routing extends Tx {
  readonly routingProgramId: PublicKey

  private _swap: Swap

  constructor(
    routingPromgramAddress = DEFAULT_ROUTING_PROGRAM_ADDRESS,
    swapProgramAddress = DEFAULT_SWAP_PROGRAM_ADDRESS,
    spltProgramAddress = DEFAULT_SPLT_PROGRAM_ADDRESS,
    splataProgramAddress = DEFAULT_SPLATA_PROGRAM_ADDRESS,
    nodeUrl: string,
  ) {
    super(nodeUrl, ErrorMapping)

    if (!account.isAddress(routingPromgramAddress))
      throw new Error('Invalid rounting program address')
    this.routingProgramId = account.fromAddress(
      routingPromgramAddress,
    ) as PublicKey

    this._swap = new Swap(
      swapProgramAddress,
      spltProgramAddress,
      splataProgramAddress,
      nodeUrl,
    )
  }

  /**
   * Find treasury accounts of a pool by mint addresses
   * @param mintAddress
   * @param poolData
   * @returns
   */
  private findTreasury = (mintAddress: string, poolData: PoolData): string => {
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    const { mint_s, mint_a, mint_b, treasury_s, treasury_a, treasury_b } =
      poolData
    const mints = [mint_s, mint_a, mint_b]
    const treasuries = [treasury_s, treasury_a, treasury_b]
    const index = mints.findIndex((address) => address === mintAddress)
    if (index < 0) throw new Error('There is no treasury account matched')
    return treasuries[index]
  }

  /**
   * Conveniently swap (with auto account initilization)
   * @param amount
   * @param limit
   * @param poolAddress
   * @param srcMintAddress
   * @param dstMintAddress
   * @param wallet
   * @returns
   */
  swap = async (
    amount: bigint,
    limit: bigint,
    poolAddress: string,
    srcMintAddress: string,
    dstMintAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; accountAddress: string }> => {
    // Validation #1
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    if (!account.isAddress(srcMintAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(dstMintAddress))
      throw new Error('Invalid destination address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const poolData = await this._swap.getPoolData(poolAddress)
    const { vault: vaultAddress, treasury_s: treasurySAddress } = poolData
    const [srcAddress, dstAddress] = await Promise.all(
      [srcMintAddress, dstMintAddress].map((mintAddress) =>
        account.deriveAssociatedAddress(
          payerAddress,
          mintAddress,
          this._swap.spltProgramId.toBase58(),
          this._swap.splataProgramId.toBase58(),
        ),
      ),
    )
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const vaultPublicKey = account.fromAddress(vaultAddress) as PublicKey
    const srcPublicKey = account.fromAddress(srcAddress) as PublicKey
    const dstPublicKey = account.fromAddress(dstAddress) as PublicKey
    const dstMintPublicKey = account.fromAddress(dstMintAddress) as PublicKey
    const treasurySPublicKey = account.fromAddress(
      treasurySAddress,
    ) as PublicKey
    // Get treasurer
    const seed = [poolPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this._swap.swapProgramId,
    )
    // Get bid, ask treasury
    const treasuryBidPublicKey = account.fromAddress(
      this.findTreasury(srcMintAddress, poolData),
    ) as PublicKey
    const treasuryAskPublicKey = account.fromAddress(
      this.findTreasury(dstMintAddress, poolData),
    ) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
        { key: 'limit', type: 'u64' },
      ],
      { code: 0, amount, limit },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: poolPublicKey, isSigner: false, isWritable: true },
        { pubkey: vaultPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryBidPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstMintPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryAskPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurySPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        {
          pubkey: this._swap.spltProgramId,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: this._swap.splataProgramId,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: this._swap.swapProgramId,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.routingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, accountAddress: dstAddress }
  }

  /**
   * Auto routing
   * @param amount
   * @param firstLimit
   * @param firstPoolAddress
   * @param srcMintAddress
   * @param secondLimit
   * @param secondPoolAddress
   * @param dstMintAddress
   * @param wallet
   * @returns
   */
  route = async (
    amount: bigint,
    firstLimit: bigint,
    firstPoolAddress: string,
    srcMintAddress: string,
    secondLimit: bigint,
    secondPoolAddress: string,
    dstMintAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; accountAddress: string }> => {
    // Validation #1
    if (!account.isAddress(firstPoolAddress))
      throw new Error('Invalid pool #1 address')
    if (!account.isAddress(srcMintAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(secondPoolAddress))
      throw new Error('Invalid pool #2 address')
    if (!account.isAddress(dstMintAddress))
      throw new Error('Invalid destination address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const firstPoolData = await this._swap.getPoolData(firstPoolAddress)
    const {
      vault: firstVaultAddress,
      treasury_s: firstTreasurySAddress,
      mint_s: firstMiddleMintAddress,
    } = firstPoolData
    const srcAddress = await account.deriveAssociatedAddress(
      payerAddress,
      srcMintAddress,
      this._swap.spltProgramId.toBase58(),
      this._swap.splataProgramId.toBase58(),
    )
    const secondPoolData = await this._swap.getPoolData(secondPoolAddress)
    const {
      vault: secondVaultAddress,
      treasury_s: secondTreasurySAddress,
      mint_s: secondMiddleMintAddress,
    } = secondPoolData
    const dstAddress = await account.deriveAssociatedAddress(
      payerAddress,
      dstMintAddress,
      this._swap.spltProgramId.toBase58(),
      this._swap.splataProgramId.toBase58(),
    )
    // Check matched pools
    if (firstMiddleMintAddress !== secondMiddleMintAddress)
      throw new Error('Unmatched middle mint')
    // Build middle man
    const middleMintPublicKey = account.fromAddress(
      firstMiddleMintAddress,
    ) as PublicKey
    const middleAddress = await account.deriveAssociatedAddress(
      payerAddress,
      firstMiddleMintAddress,
      this._swap.spltProgramId.toBase58(),
      this._swap.splataProgramId.toBase58(),
    )
    const middlePublicKey = account.fromAddress(middleAddress) as PublicKey
    // Build public keys
    const firstPoolPublicKey = account.fromAddress(
      firstPoolAddress,
    ) as PublicKey
    const firstVaultPublicKey = account.fromAddress(
      firstVaultAddress,
    ) as PublicKey
    const srcPublicKey = account.fromAddress(srcAddress) as PublicKey
    const srcMintPublicKey = account.fromAddress(srcMintAddress) as PublicKey
    const firstTreasurySPublicKey = account.fromAddress(
      firstTreasurySAddress,
    ) as PublicKey
    const secondPoolPublicKey = account.fromAddress(
      secondPoolAddress,
    ) as PublicKey
    const secondVaultPublicKey = account.fromAddress(
      secondVaultAddress,
    ) as PublicKey
    const dstPublicKey = account.fromAddress(dstAddress) as PublicKey
    const dstMintPublicKey = account.fromAddress(dstMintAddress) as PublicKey
    const secondTreasurySPublicKey = account.fromAddress(
      secondTreasurySAddress,
    ) as PublicKey
    // Get treasurer
    const firstTreasurerPublicKey = await PublicKey.createProgramAddress(
      [firstPoolPublicKey.toBuffer()],
      this._swap.swapProgramId,
    )
    const secondTreasurerPublicKey = await PublicKey.createProgramAddress(
      [secondPoolPublicKey.toBuffer()],
      this._swap.swapProgramId,
    )
    // Get bid, ask treasury
    const treasuryBidPublicKey = account.fromAddress(
      this.findTreasury(srcMintAddress, firstPoolData),
    ) as PublicKey
    const treasuryAskPublicKey = account.fromAddress(
      this.findTreasury(dstMintAddress, secondPoolData),
    ) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
        { key: 'firstLimit', type: 'u64' },
        { key: 'secondLimit', type: 'u64' },
      ],
      { code: 1, amount, firstLimit, secondLimit },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: firstPoolPublicKey, isSigner: false, isWritable: true },
        { pubkey: firstVaultPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcMintPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryBidPublicKey, isSigner: false, isWritable: true },
        { pubkey: firstTreasurySPublicKey, isSigner: false, isWritable: true },
        { pubkey: firstTreasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: secondPoolPublicKey, isSigner: false, isWritable: true },
        { pubkey: secondVaultPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstMintPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryAskPublicKey, isSigner: false, isWritable: true },
        { pubkey: secondTreasurySPublicKey, isSigner: false, isWritable: true },
        {
          pubkey: secondTreasurerPublicKey,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: middlePublicKey, isSigner: false, isWritable: true },
        { pubkey: middleMintPublicKey, isSigner: false, isWritable: false },
        {
          pubkey: this._swap.spltProgramId,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: this._swap.splataProgramId,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: this._swap.swapProgramId,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.routingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, accountAddress: dstAddress }
  }

  /**
   * Conveniently add liquidity (with auto account initilization)
   * @param deltaS
   * @param deltaA
   * @param deltaB
   * @param poolAddress
   * @param wallet
   * @returns
   */
  addLiquidity = async (
    deltaS: bigint,
    deltaA: bigint,
    deltaB: bigint,
    poolAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; lptAddress: string }> => {
    // Validation #1
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const poolData = await this._swap.getPoolData(poolAddress)
    const {
      mint_s,
      mint_a,
      mint_b,
      mint_lpt,
      treasury_s,
      treasury_a,
      treasury_b,
    } = poolData
    const [srcSAddress, srcAAddress, srcBAddress, lptAddress] =
      await Promise.all(
        [mint_s, mint_a, mint_b, mint_lpt].map((mintAddress) =>
          account.deriveAssociatedAddress(
            payerAddress,
            mintAddress,
            this._swap.spltProgramId.toBase58(),
            this._swap.splataProgramId.toBase58(),
          ),
        ),
      )
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const lptPublicKey = account.fromAddress(lptAddress) as PublicKey
    const mintLPTPublicKey = account.fromAddress(mint_lpt) as PublicKey
    const srcSPublicKey = account.fromAddress(srcSAddress) as PublicKey
    const srcAPublicKey = account.fromAddress(srcAAddress) as PublicKey
    const srcBPublicKey = account.fromAddress(srcBAddress) as PublicKey
    const [treasurySPublicKey, treasuryAPublicKey, treasuryBPublicKey] = [
      treasury_s,
      treasury_a,
      treasury_b,
    ].map((address) => account.fromAddress(address) as PublicKey)
    // Get treasurer
    const seed = [poolPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this._swap.swapProgramId,
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
      { code: 2, delta_s: deltaS, delta_a: deltaA, delta_b: deltaB },
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
        {
          pubkey: this._swap.spltProgramId,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: this._swap.splataProgramId,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: this._swap.swapProgramId,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.routingProgramId,
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
   * Conveniently remove liquidity (with auto account initilization)
   * @param lpt
   * @param poolAddress
   * @param wallet
   * @returns
   */
  removeLiquidity = async (
    lpt: bigint,
    poolAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    dstSAddress: string
    dstAAddress: string
    dstBAddress: string
  }> => {
    // Validation #1
    if (!account.isAddress(poolAddress)) throw new Error('Invalid pool address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const poolData = await this._swap.getPoolData(poolAddress)
    const {
      mint_s,
      mint_a,
      mint_b,
      mint_lpt,
      treasury_s,
      treasury_a,
      treasury_b,
    } = poolData
    const [dstSAddress, dstAAddress, dstBAddress, lptAddress] =
      await Promise.all(
        [mint_s, mint_a, mint_b, mint_lpt].map((mintAddress) =>
          account.deriveAssociatedAddress(
            payerAddress,
            mintAddress,
            this._swap.spltProgramId.toBase58(),
            this._swap.splataProgramId.toBase58(),
          ),
        ),
      )
    // Build public keys
    const poolPublicKey = account.fromAddress(poolAddress) as PublicKey
    const lptPublicKey = account.fromAddress(lptAddress) as PublicKey
    const mintLPTPublicKey = account.fromAddress(mint_lpt) as PublicKey
    const dstSPublicKey = account.fromAddress(dstSAddress) as PublicKey
    const dstAPublicKey = account.fromAddress(dstAAddress) as PublicKey
    const dstBPublicKey = account.fromAddress(dstBAddress) as PublicKey
    const [mintSPublicKey, mintAPublicKey, mintBPublicKey] = [
      mint_s,
      mint_a,
      mint_b,
    ].map((address) => account.fromAddress(address) as PublicKey)
    const [treasurySPublicKey, treasuryAPublicKey, treasuryBPublicKey] = [
      treasury_s,
      treasury_a,
      treasury_b,
    ].map((address) => account.fromAddress(address) as PublicKey)
    // Get treasurer
    const seed = [poolPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this._swap.swapProgramId,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'lpt', type: 'u64' },
      ],
      { code: 3, lpt },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: poolPublicKey, isSigner: false, isWritable: true },
        { pubkey: lptPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintLPTPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstSPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintSPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasurySPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstAPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintAPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryAPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstBPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintBPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryBPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        {
          pubkey: this._swap.spltProgramId,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: this._swap.splataProgramId,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: this._swap.swapProgramId,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.routingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, dstSAddress, dstAAddress, dstBAddress }
  }
}

export default Routing
