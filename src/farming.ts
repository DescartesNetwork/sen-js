import {
  Transaction,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  PublicKey,
  GetProgramAccountsFilter,
  KeyedAccountInfo,
} from '@solana/web3.js'

import Tx from './core/tx'
import SPLT from './splt'
import account from './account'
import schema, { DebtData, FarmData } from './schema'
import {
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_FARMING_PROGRAM_ADDRESS,
} from './default'
import { WalletInterface } from './rawWallet'

const soproxABI = require('soprox-abi')

export type FarmingAccountChangeInfo = {
  type: 'farm' | 'debt'
  address: string
  data: Buffer
}

const ErrorMapping = [
  'Invalid instruction',
  'Invalid owner',
  'Incorrect program id',
  'Already constructed',
  'Operation overflowed',
  'Farm unmatched',
  'Farm frozen',
  'Zero value',
  'Insufficient funds',
]

class Farming extends Tx {
  farmingProgramId: PublicKey
  spltProgramId: PublicKey
  splataProgramId: PublicKey
  private _splt: SPLT

  constructor(
    farmingProgramAddress = DEFAULT_FARMING_PROGRAM_ADDRESS,
    spltProgramAddress = DEFAULT_SPLT_PROGRAM_ADDRESS,
    splataProgramAddress = DEFAULT_SPLATA_PROGRAM_ADDRESS,
    nodeUrl: string,
  ) {
    super(nodeUrl, ErrorMapping)

    if (!account.isAddress(farmingProgramAddress))
      throw new Error('Invalid farming program address')
    if (!account.isAddress(spltProgramAddress))
      throw new Error('Invalid SPL token program address')
    if (!account.isAddress(splataProgramAddress))
      throw new Error('Invalid SPL associated token program address')
    this.farmingProgramId = account.fromAddress(
      farmingProgramAddress,
    ) as PublicKey
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
      data:
        | (Omit<FarmingAccountChangeInfo, 'data'> & {
            data: FarmData | DebtData
          })
        | null,
    ) => void,
    filters?: GetProgramAccountsFilter[],
  ): number => {
    const cb = ({
      accountId,
      accountInfo: { data: buf },
    }: KeyedAccountInfo) => {
      const address = accountId.toBase58()
      const farmSpace = new soproxABI.struct(schema.FARM_SCHEMA).space
      const debtSpace = new soproxABI.struct(schema.DEBT_SCHEMA).space
      let type = null
      let data = {}
      if (buf.length === farmSpace) {
        type = 'farm'
        data = this.parseFarmData(buf)
      }
      if (buf.length === debtSpace) {
        type = 'debt'
        data = this.parseDebtData(buf)
      }
      if (!type) return callback('Unmatched type', null)
      return callback(null, {
        type: type as FarmingAccountChangeInfo['type'],
        address,
        data: data as FarmData | DebtData,
      })
    }
    return this.connection.onProgramAccountChange(
      this.farmingProgramId,
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
   * Derive debt address
   * @param ownerAddress
   * @param farmAddress
   * @returns
   */
  deriveDebtAddress = async (
    ownerAddress: string,
    farmAddress: string,
  ): Promise<string> => {
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    const ownerPublicKey = account.fromAddress(ownerAddress) as PublicKey
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
    const seeds = [
      ownerPublicKey.toBuffer(),
      farmPublicKey.toBuffer(),
      this.farmingProgramId.toBuffer(),
    ]
    const [debtPublicKey, _] = await PublicKey.findProgramAddress(
      seeds,
      this.farmingProgramId,
    )
    return debtPublicKey.toBase58()
  }

  /**
   * Parse farm buffer data
   * @param data
   * @returns
   */
  parseFarmData = (data: Buffer): FarmData => {
    const layout = new soproxABI.struct(schema.FARM_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get farm data
   * @param farmAddress
   * @returns
   */
  getFarmData = async (farmAddress: string): Promise<FarmData> => {
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
    const { data } = (await this.connection.getAccountInfo(farmPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${farmAddress}`)
    return this.parseFarmData(data)
  }

  /**
   * Parse debt buffer data
   * @param data
   * @returns
   */
  parseDebtData = (data: Buffer): DebtData => {
    const layout = new soproxABI.struct(schema.DEBT_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get debt data
   * @param debtAddress
   * @returns
   */
  getDebtData = async (debtAddress: string): Promise<DebtData> => {
    if (!account.isAddress(debtAddress)) throw new Error('Invalid debt address')
    const debtPublicKey = account.fromAddress(debtAddress) as PublicKey
    const { data } = (await this.connection.getAccountInfo(debtPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${debtAddress}`)
    return this.parseDebtData(data)
  }

  /**
   * Initialize a farm
   * @param reward
   * @param period seconds
   * @param ownerAddress
   * @param mintStakeAddress
   * @param mintRewardAddress
   * @param wallet
   * @returns
   */
  initializeFarm = async (
    reward: bigint,
    period: bigint,
    ownerAddress: string,
    mintStakeAddress: string,
    mintRewardAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    farmAddress: string
  }> => {
    // Validation
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    if (!account.isAddress(mintStakeAddress))
      throw new Error('Invalid mint stake address')
    if (!account.isAddress(mintRewardAddress))
      throw new Error('Invalid mint reward address')
    // Fetch necessary info
    const farm = await account.createStrictAccount(this.farmingProgramId)
    const farmAddress = farm.publicKey.toBase58()
    // Build public keys
    const ownerPublicKey = account.fromAddress(ownerAddress) as PublicKey
    const mintStakePublicKey = account.fromAddress(
      mintStakeAddress,
    ) as PublicKey
    const mintRewardPublicKey = account.fromAddress(
      mintRewardAddress,
    ) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Get treasurer
    const seed = [farm.publicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.farmingProgramId,
    )
    const treasurerAddress = treasurerPublicKey.toBase58()
    // Get treasuries
    const treasuryStakePublicKey = account.fromAddress(
      await this._splt.deriveAssociatedAddress(
        treasurerAddress,
        mintStakeAddress,
      ),
    ) as PublicKey
    const treasuryRewardPublicKey = account.fromAddress(
      await this._splt.deriveAssociatedAddress(
        treasurerAddress,
        mintRewardAddress,
      ),
    ) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'reward', type: 'u64' },
        { key: 'period', type: 'u64' },
      ],
      { code: 0, reward, period },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: ownerPublicKey, isSigner: false, isWritable: false },
        { pubkey: farm.publicKey, isSigner: true, isWritable: true },
        { pubkey: mintStakePublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryStakePublicKey, isSigner: false, isWritable: true },
        { pubkey: mintRewardPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.farmingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    const farmSig = await this.selfSign(transaction, farm)
    this.addSignature(transaction, farmSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, farmAddress }
  }

  /**
   * Initialize accounts including rewarded and debt
   * @param farmAddress
   * @param ownerAddress
   * @param wallet
   * @returns
   */
  initializeAccounts = async (
    farmAddress: string,
    ownerAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    rewardedAddress: string
    debtAddress: string
  }> => {
    // Validation
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    // Fetch necessary info
    const { mint_reward: mintRewardAddress } = await this.getFarmData(
      farmAddress,
    )
    const rewardedAddress = await this._splt.deriveAssociatedAddress(
      ownerAddress,
      mintRewardAddress,
    )
    const debtAddress = await this.deriveDebtAddress(ownerAddress, farmAddress)
    // Build public keys
    const ownerPublicKey = account.fromAddress(ownerAddress) as PublicKey
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
    const mintRewardPublicKey = account.fromAddress(
      mintRewardAddress,
    ) as PublicKey
    const rewardedPublicKey = account.fromAddress(rewardedAddress) as PublicKey
    const debtPublicKey = account.fromAddress(debtAddress) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 1,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: ownerPublicKey, isSigner: false, isWritable: false },
        { pubkey: farmPublicKey, isSigner: false, isWritable: false },
        { pubkey: mintRewardPublicKey, isSigner: false, isWritable: false },
        { pubkey: rewardedPublicKey, isSigner: false, isWritable: true },
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.farmingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, rewardedAddress, debtAddress }
  }

  /**
   * Stake
   * You stake tokens from the source address, and havest SEN to rewarded address
   * @param amount
   * @param srcAddress Source address that deposit tokens
   * @param rewardedAddress Rewarded address that receive havested SEN
   * @param farmAddress
   * @param wallet
   * @returns
   */
  stake = async (
    amount: bigint,
    srcAddress: string,
    rewardedAddress: string,
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; debtAddress: string }> => {
    // Validation
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(rewardedAddress))
      throw new Error('Invalid rewarded address')
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const {
      treasury_stake: treasuryStakeAddress,
      treasury_reward: treasuryRewardAddress,
    } = await this.getFarmData(farmAddress)
    const debtAddress = await this.deriveDebtAddress(payerAddress, farmAddress)
    // Build public keys
    const srcPublicKey = account.fromAddress(srcAddress) as PublicKey
    const rewardedPublicKey = account.fromAddress(rewardedAddress) as PublicKey
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
    const treasuryStakePublicKey = account.fromAddress(
      treasuryStakeAddress,
    ) as PublicKey
    const treasuryRewardPublicKey = account.fromAddress(
      treasuryRewardAddress,
    ) as PublicKey
    const debtPublicKey = account.fromAddress(debtAddress) as PublicKey
    // Get treasurer
    const seed = [farmPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.farmingProgramId,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: 2, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryStakePublicKey, isSigner: false, isWritable: true },
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },
        { pubkey: rewardedPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.farmingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, debtAddress }
  }

  /**
   * Unstake
   * You unstake tokens to the destination address, and havest SEN to rewarded address
   * @param amount
   * @param dstAddress
   * @param rewardedAddress
   * @param farmAddress
   * @param wallet
   * @returns
   */
  unstake = async (
    amount: bigint,
    dstAddress: string,
    rewardedAddress: string,
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; debtAddress: string }> => {
    // Validation
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    if (!account.isAddress(rewardedAddress))
      throw new Error('Invalid rewarded address')
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const {
      treasury_stake: treasuryStakeAddress,
      treasury_reward: treasuryRewardAddress,
    } = await this.getFarmData(farmAddress)
    const debtAddress = await this.deriveDebtAddress(payerAddress, farmAddress)
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
    const dstPublicKey = account.fromAddress(dstAddress) as PublicKey
    const rewardedPublicKey = account.fromAddress(rewardedAddress) as PublicKey
    const treasuryStakePublicKey = account.fromAddress(
      treasuryStakeAddress,
    ) as PublicKey
    const treasuryRewardPublicKey = account.fromAddress(
      treasuryRewardAddress,
    ) as PublicKey
    const debtPublicKey = account.fromAddress(debtAddress) as PublicKey
    // Get treasurer
    const seed = [farmPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.farmingProgramId,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: 3, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryStakePublicKey, isSigner: false, isWritable: true },
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },
        { pubkey: rewardedPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.farmingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, debtAddress }
  }

  /**
   * Havest
   * @param farmAddress
   * @param rewardedAddress
   * @param wallet
   * @returns
   */
  harvest = async (
    farmAddress: string,
    rewardedAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; debtAddress: string }> => {
    // Validation
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    if (!account.isAddress(rewardedAddress))
      throw new Error('Invalid rewarded address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const { treasury_reward: treasuryRewardAddress } = await this.getFarmData(
      farmAddress,
    )
    const debtAddress = await this.deriveDebtAddress(payerAddress, farmAddress)
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
    const rewardedPublicKey = account.fromAddress(rewardedAddress) as PublicKey
    const treasuryRewardPublicKey = account.fromAddress(
      treasuryRewardAddress,
    ) as PublicKey
    const debtPublicKey = account.fromAddress(debtAddress) as PublicKey
    // Get treasurer
    const seed = [farmPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.farmingProgramId,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 4,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },
        { pubkey: rewardedPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.farmingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, debtAddress }
  }

  /**
   * Seed more reward
   * @param amount
   * @param farmAddress
   * @param srcAddress
   * @param wallet
   * @returns
   */
  seed = async (
    amount: bigint,
    farmAddress: string,
    srcAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    // Fetch necessary info
    const { treasury_reward: treasuryRewardAddress } = await this.getFarmData(
      farmAddress,
    )
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
    const srcPublicKey = account.fromAddress(srcAddress) as PublicKey
    const treasuryRewardPublicKey = account.fromAddress(
      treasuryRewardAddress,
    ) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: 7, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.farmingProgramId,
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
   * Unseed less reward
   * @param amount
   * @param farmAddress
   * @param dstAddress
   * @param wallet
   * @returns
   */
  unseed = async (
    amount: bigint,
    farmAddress: string,
    dstAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    // Fetch necessary info
    const { treasury_reward: treasuryRewardAddress } = await this.getFarmData(
      farmAddress,
    )
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
    const dstPublicKey = account.fromAddress(dstAddress) as PublicKey
    const treasuryRewardPublicKey = account.fromAddress(
      treasuryRewardAddress,
    ) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Get treasurer
    const seed = [farmPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.farmingProgramId,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: 8, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.farmingProgramId,
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
   * Freeze a farm
   * @param farmAddress
   * @param wallet
   * @returns
   */
  freeze = async (
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farmaddress')
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
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
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
      ],
      programId: this.farmingProgramId,
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
   * Thaw a farm
   * @param farmAddress
   * @param wallet
   * @returns
   */
  thaw = async (
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
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
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
      ],
      programId: this.farmingProgramId,
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
   * Transfer farm's ownership
   * @param farmAddress
   * @param newOwnerAddress
   * @param wallet
   * @returns
   */
  transferFarmOwnership = async (
    farmAddress: string,
    newOwnerAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    if (!account.isAddress(newOwnerAddress))
      throw new Error('Invalid new owner address')
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
    const newOwnerPublicKey = account.fromAddress(newOwnerAddress) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 9,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: newOwnerPublicKey, isSigner: false, isWritable: false },
      ],
      programId: this.farmingProgramId,
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
   * Close debt account
   * @param farmAddress
   * @param wallet
   * @returns
   */
  closeDebt = async (
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const debtAddress = await this.deriveDebtAddress(payerAddress, farmAddress)
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
    const debtPublicKey = account.fromAddress(debtAddress) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 10,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: false },
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },
        { pubkey: payerPublicKey, isSigner: false, isWritable: true },
      ],
      programId: this.farmingProgramId,
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
   * Close a farm
   * @param farmAddress
   * @param wallet
   * @returns
   */
  closeFarm = async (
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 11,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: payerPublicKey, isSigner: false, isWritable: true },
      ],
      programId: this.farmingProgramId,
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

export default Farming
