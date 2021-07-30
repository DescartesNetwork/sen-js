import {
  PublicKey,
  Transaction,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  SystemProgram,
  GetProgramAccountsFilter,
  KeyedAccountInfo,
} from '@solana/web3.js'

import Tx from './core/tx'
import account from './account'
import {
  DEFAULT_SWAP_PROGRAM_ADDRESS,
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_ROUTING_PROGRAM_ADDRESS,
} from './default'
import { WalletInterface } from './wallet/baseWallet'
import Swap from './swap'
import SPLT from './splt'

const soproxABI = require('soprox-abi')

class Routing extends Tx {
  readonly routingProgramId: PublicKey

  private _swap: Swap
  private _splt: SPLT

  constructor(
    routingPromgramAddress = DEFAULT_ROUTING_PROGRAM_ADDRESS,
    swapProgramAddress = DEFAULT_SWAP_PROGRAM_ADDRESS,
    spltProgramAddress = DEFAULT_SPLT_PROGRAM_ADDRESS,
    splataProgramAddress = DEFAULT_SPLATA_PROGRAM_ADDRESS,
    nodeUrl: string,
  ) {
    super(nodeUrl)

    if (!account.isAddress(routingPromgramAddress))
      throw new Error('Invalid rounting program address')
    this.routingProgramId = account.fromAddress(
      routingPromgramAddress,
    ) as PublicKey

    this._splt = new SPLT(spltProgramAddress, splataProgramAddress, nodeUrl)
    this._swap = new Swap(
      swapProgramAddress,
      spltProgramAddress,
      splataProgramAddress,
      nodeUrl,
    )
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
          this._swap.spltProgramId.toBase58(),
          this._swap.splataProgramId.toBase58(),
        )
      }),
    )
    return treasuryAddresses
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
    const { vault: vaultAddress, treasury_s: treasurySAddress } =
      await this._swap.getPoolData(poolAddress)
    const srcAddress = await account.deriveAssociatedAddress(
      payerAddress,
      srcMintAddress,
      this._swap.spltProgramId.toBase58(),
      this._swap.splataProgramId.toBase58(),
    )
    const dstAddress = await account.deriveAssociatedAddress(
      payerAddress,
      dstMintAddress,
      this._swap.spltProgramId.toBase58(),
      this._swap.splataProgramId.toBase58(),
    )
    // Validation #2
    if (!account.isAddress(vaultAddress))
      throw new Error('Invalid vault address')
    if (!account.isAddress(treasurySAddress))
      throw new Error('Invalid treasury sen address')
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source mint address')
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination mint address')
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
    const treasurerAddress = treasurerPublicKey.toBase58()
    // Get bid, ask treasury
    const treasuryBidPublicKey = account.fromAddress(
      await account.deriveAssociatedAddress(
        treasurerAddress,
        srcMintAddress,
        this._swap.spltProgramId.toBase58(),
        this._swap.splataProgramId.toBase58(),
      ),
    ) as PublicKey
    const treasuryAskPublicKey = account.fromAddress(
      await account.deriveAssociatedAddress(
        treasurerAddress,
        dstMintAddress,
        this._swap.spltProgramId.toBase58(),
        this._swap.splataProgramId.toBase58(),
      ),
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
    const {
      vault: firstVaultAddress,
      treasury_s: firstTreasurySAddress,
      mint_s: firstMiddleMintAddress,
    } = await this._swap.getPoolData(firstPoolAddress)
    const srcAddress = await account.deriveAssociatedAddress(
      payerAddress,
      srcMintAddress,
      this._swap.spltProgramId.toBase58(),
      this._swap.splataProgramId.toBase58(),
    )
    const {
      vault: secondVaultAddress,
      treasury_s: secondTreasurySAddress,
      mint_s: secondMiddleMintAddress,
    } = await this._swap.getPoolData(secondPoolAddress)
    const dstAddress = await account.deriveAssociatedAddress(
      payerAddress,
      dstMintAddress,
      this._swap.spltProgramId.toBase58(),
      this._swap.splataProgramId.toBase58(),
    )
    // Validation #2
    if (!account.isAddress(firstMiddleMintAddress))
      throw new Error('Invalid middle mint #1 address')
    if (!account.isAddress(secondMiddleMintAddress))
      throw new Error('Invalid middle mint #2 address')
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
    // Validation #3
    if (!account.isAddress(firstVaultAddress))
      throw new Error('Invalid vault #1 address')
    if (!account.isAddress(firstTreasurySAddress))
      throw new Error('Invalid treasury sen #1 address')
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source mint address')
    if (!account.isAddress(secondVaultAddress))
      throw new Error('Invalid vault #2 address')
    if (!account.isAddress(secondTreasurySAddress))
      throw new Error('Invalid treasury sen #2 address')
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination mint address')
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
    const firstTreasurerAddress = firstTreasurerPublicKey.toBase58()
    const secondTreasurerPublicKey = await PublicKey.createProgramAddress(
      [secondPoolPublicKey.toBuffer()],
      this._swap.swapProgramId,
    )
    const secondTreasurerAddress = secondTreasurerPublicKey.toBase58()
    // Get bid, ask treasury
    const treasuryBidPublicKey = account.fromAddress(
      await account.deriveAssociatedAddress(
        firstTreasurerAddress,
        srcMintAddress,
        this._swap.spltProgramId.toBase58(),
        this._swap.splataProgramId.toBase58(),
      ),
    ) as PublicKey
    const treasuryAskPublicKey = account.fromAddress(
      await account.deriveAssociatedAddress(
        secondTreasurerAddress,
        dstMintAddress,
        this._swap.spltProgramId.toBase58(),
        this._swap.splataProgramId.toBase58(),
      ),
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
}

export default Routing
