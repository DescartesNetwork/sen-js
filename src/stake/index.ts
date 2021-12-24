import {
  Transaction,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  PublicKey,
  GetProgramAccountsFilter,
  KeyedAccountInfo,
} from '@solana/web3.js'

import Tx from '../core/tx'
import SPLT from '../splt'
import account from '../account'
import schema, { StakeDebtData, StakeFarmData } from '../schema'
import {
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_STAKE_PROGRAM_ADDRESS,
} from '../default'
import { WalletInterface } from '../rawWallet'
import { InstructionCode, ErrorMapping } from './constant'
import { uint32ToBuffer, genFarmAccount } from './util'

const soproxABI = require('soprox-abi')

export type StakeAccountChangeInfo = {
  type: 'farm' | 'debt'
  address: string
  data: Buffer
}

class Stake extends Tx {
  stakeProgramId: PublicKey
  spltProgramId: PublicKey
  splataProgramId: PublicKey
  private _splt: SPLT

  constructor(
    stakeProgramAddress = DEFAULT_STAKE_PROGRAM_ADDRESS,
    spltProgramAddress = DEFAULT_SPLT_PROGRAM_ADDRESS,
    splataProgramAddress = DEFAULT_SPLATA_PROGRAM_ADDRESS,
    nodeUrl: string,
  ) {
    super(nodeUrl, ErrorMapping)

    if (!account.isAddress(stakeProgramAddress))
      throw new Error('Invalid stake program address')
    if (!account.isAddress(spltProgramAddress))
      throw new Error('Invalid SPL token program address')
    if (!account.isAddress(splataProgramAddress))
      throw new Error('Invalid SPL associated token program address')
    this.stakeProgramId = account.fromAddress(stakeProgramAddress)
    this.spltProgramId = account.fromAddress(spltProgramAddress)
    this.splataProgramId = account.fromAddress(splataProgramAddress)

    this._splt = new SPLT(spltProgramAddress, splataProgramAddress, nodeUrl)
  }

  /**
   * Watch account changes
   * @param callback - The callback will be called when there is any change
   * @param filters - GetProgramAccountsFilter - Ref: {@link https://solana-labs.github.io/solana-web3.js/modules.html#GetProgramAccountsFilter}
   * @returns Watch id
   */
  watch = (
    callback: (
      error: string | null,
      data:
        | (Omit<StakeAccountChangeInfo, 'data'> & {
            data: StakeFarmData | StakeDebtData
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
        type: type as StakeAccountChangeInfo['type'],
        address,
        data: data as StakeFarmData | StakeDebtData,
      })
    }
    return this.connection.onProgramAccountChange(
      this.stakeProgramId,
      cb,
      'confirmed',
      filters,
    )
  }

  /**
   * Unwatch a watcher by watch id
   * @param watchId - The watchId was returned by {@link https://descartesnetwork.github.io/sen-js/classes/Farming.html#watch | watch} function.
   * @returns
   */
  unwatch = async (watchId: number): Promise<void> => {
    if (!watchId) return
    return await this.connection.removeProgramAccountChangeListener(watchId)
  }

  /**
   * Parse farm buffer data
   * @param data - Buffer data (raw data) that you get by {@link https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getAccountInfo | connection.getAccountInfo}
   * @returns Readable json data respect to {@link https://descartesnetwork.github.io/sen-js/modules.html#schema | FARM_SCHEMA}
   */
  parseFarmData = (data: Buffer): StakeFarmData => {
    const layout = new soproxABI.struct(schema.STAKE_FARM_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get farm data
   * @param farmAddress - Farm account address
   * @returns Readable json data respect to {@link https://descartesnetwork.github.io/sen-js/modules.html#schema | FARM_SCHEMA}
   */
  getFarmData = async (farmAddress: string): Promise<StakeFarmData> => {
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    const farmPublicKey = account.fromAddress(farmAddress)
    const { data } = (await this.connection.getAccountInfo(farmPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${farmAddress}`)
    return this.parseFarmData(data)
  }

  /**
   * Parse debt buffer data
   * @param data - Buffer data (raw data) that you get by {@link https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getAccountInfo | connection.getAccountInfo}
   * @returns Readable json data respect to {@link https://descartesnetwork.github.io/sen-js/modules.html#schema | DEBT_SCHEMA}
   */
  parseDebtData = (data: Buffer): StakeDebtData => {
    const layout = new soproxABI.struct(schema.STAKE_DEBT_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get debt data
   * @param debtAddress - Debt account address
   * @returns Readable json data respect to {@link https://descartesnetwork.github.io/sen-js/modules.html#schema | DEBT_SCHEMA}
   */
  getDebtData = async (debtAddress: string): Promise<StakeDebtData> => {
    if (!account.isAddress(debtAddress)) throw new Error('Invalid debt address')
    const debtPublicKey = account.fromAddress(debtAddress)
    const { data } = (await this.connection.getAccountInfo(debtPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${debtAddress}`)
    return this.parseDebtData(data)
  }

  /**
   * Derive debt address
   * @param index - Account index (MAX: 4294967296)
   * @param ownerAddress - Owner address of the debt account
   * @param farmAddress - Corresponding farm address to the debt account
   * @returns Debt account address
   */
  deriveDebtAddress = async (
    index: number,
    ownerAddress: string,
    farmAddress: string,
  ): Promise<string> => {
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    const ownerPublicKey = account.fromAddress(ownerAddress)
    const farmPublicKey = account.fromAddress(farmAddress)
    const seeds = [
      uint32ToBuffer(index),
      ownerPublicKey.toBuffer(),
      farmPublicKey.toBuffer(),
      this.stakeProgramId.toBuffer(),
    ]
    const [debtPublicKey, _] = await PublicKey.findProgramAddress(
      seeds,
      this.stakeProgramId,
    )
    return debtPublicKey.toBase58()
  }

  /**
   * Derive the stake treasurer and the reward treasurer address
   * @param farmAddress - The farm address owns the treasurers
   * @returns
   */
  private deriveFarmTreasurerAddresses = async (
    farmAddress: string,
  ): Promise<[string, string]> => {
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    const farmPublicKey = account.fromAddress(farmAddress)
    const stakeTreasurerPublicKey = await PublicKey.createProgramAddress(
      [uint32ToBuffer(0), farmPublicKey.toBuffer()],
      this.stakeProgramId,
    )
    const rewardTreasurerPublicKey = await PublicKey.createProgramAddress(
      [uint32ToBuffer(1), farmPublicKey.toBuffer()],
      this.stakeProgramId,
    )
    return [
      stakeTreasurerPublicKey.toBase58(),
      rewardTreasurerPublicKey.toBase58(),
    ]
  }

  /**
   * Initialize a farm
   * @param reward - The number of tokens per period
   * @param period - The number of seconds for a reward period
   * @param ownerAddress - Farm owner address
   * @param mintStakeAddress - Mint address for staking
   * @param mintRewardAddress - Mint address for rewarding
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId` and the farm address `farmAddress`
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
    const farm = await genFarmAccount(this.stakeProgramId)
    const farmAddress = farm.publicKey.toBase58()
    // Build public keys
    const ownerPublicKey = account.fromAddress(ownerAddress)
    const mintStakePublicKey = account.fromAddress(mintStakeAddress)
    const mintRewardPublicKey = account.fromAddress(mintRewardAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Get treasurers & treasuries
    const [treasurerStakeAddress, treasurerRewardAddress] =
      await this.deriveFarmTreasurerAddresses(farmAddress)
    const treasurerStakePublicKey = account.fromAddress(treasurerStakeAddress)
    const treasurerRewardPublicKey = account.fromAddress(treasurerRewardAddress)
    const treasuryStakePublicKey = account.fromAddress(
      await this._splt.deriveAssociatedAddress(
        treasurerStakeAddress,
        mintStakeAddress,
      ),
    )
    const treasuryRewardPublicKey = account.fromAddress(
      await this._splt.deriveAssociatedAddress(
        treasurerRewardAddress,
        mintRewardAddress,
      ),
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'reward', type: 'u64' },
        { key: 'period', type: 'u64' },
      ],
      { code: InstructionCode.InitializeFarm, reward, period },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: ownerPublicKey, isSigner: false, isWritable: false },
        { pubkey: farm.publicKey, isSigner: true, isWritable: true },
        { pubkey: mintStakePublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryStakePublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerStakePublicKey, isSigner: false, isWritable: false },
        { pubkey: mintRewardPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        {
          pubkey: treasurerRewardPublicKey,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.stakeProgramId,
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
   * Stake
   * Create accounts and stake tokens from the source address
   * @param index - The account's index
   * @param amount - The number of staked amount
   * @param srcAddress - Source address that stakes tokens
   * @param farmAddress - Farm address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`, and debt account address `debtAddress`
   */
  stake = async (
    index: number,
    amount: bigint,
    srcAddress: string,
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; debtAddress: string }> => {
    // Validation
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const {
      treasury_stake: treasuryStakeAddress,
      mint_stake: mintStakeAddress,
    } = await this.getFarmData(farmAddress)
    const debtAddress = await this.deriveDebtAddress(
      index,
      payerAddress,
      farmAddress,
    )
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress)
    const srcPublicKey = account.fromAddress(srcAddress)
    const treasuryStakePublicKey = account.fromAddress(treasuryStakeAddress)
    const mintStakePublicKey = account.fromAddress(mintStakeAddress)
    const debtPublicKey = account.fromAddress(debtAddress)
    // Get treasurers
    const [treasurerStakeAddress] = await this.deriveFarmTreasurerAddresses(
      farmAddress,
    )
    const treasurerStakePublicKey = account.fromAddress(treasurerStakeAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'index', type: 'u32' },
        { key: 'amount', type: 'u64' },
      ],
      { code: InstructionCode.Stake, index, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },

        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryStakePublicKey, isSigner: false, isWritable: true },
        { pubkey: mintStakePublicKey, isSigner: false, isWritable: false },
        { pubkey: treasurerStakePublicKey, isSigner: false, isWritable: false },

        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.stakeProgramId,
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
   * You havest rewards and send tokens to the rewarded address
   * @param index - The account's index
   * @param farmAddress - Farm address
   * @param rewardedAddress - Rewarded address that receive havested tokens
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`, and debt account address `debtAddress`
   */
  harvest = async (
    index: number,
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
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const {
      treasury_stake: treasuryStakeAddress,
      treasury_reward: treasuryRewardAddress,
      mint_reward: mintRewardAddress,
    } = await this.getFarmData(farmAddress)
    const debtAddress = await this.deriveDebtAddress(
      index,
      payerAddress,
      farmAddress,
    )
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress)
    const treasuryStakePublicKey = account.fromAddress(treasuryStakeAddress)
    const rewardedPublicKey = account.fromAddress(rewardedAddress)
    const treasuryRewardPublicKey = account.fromAddress(treasuryRewardAddress)
    const mintRewardPublicKey = account.fromAddress(mintRewardAddress)
    const debtPublicKey = account.fromAddress(debtAddress)
    // Get treasurer
    const [_, treasurerRewardAddress] = await this.deriveFarmTreasurerAddresses(
      farmAddress,
    )
    const treasurerRewardPublicKey = account.fromAddress(treasurerRewardAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: InstructionCode.Harvest,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },
        { pubkey: rewardedPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintRewardPublicKey, isSigner: false, isWritable: false },
        {
          pubkey: treasurerRewardPublicKey,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.stakeProgramId,
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
   * You unstake all tokens and send them to the destination address
   * @param index - The account's index
   * @param dstAddress - Destination address that receives unstaked tokens
   * @param farmAddress - Farm address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`, and debt account address `debtAddress`
   */
  unstake = async (
    index: number,
    dstAddress: string,
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; debtAddress: string }> => {
    // Validation
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const {
      treasury_stake: treasuryStakeAddress,
      mint_stake: mintStakeAddress,
    } = await this.getFarmData(farmAddress)
    const debtAddress = await this.deriveDebtAddress(
      index,
      payerAddress,
      farmAddress,
    )
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress)
    const debtPublicKey = account.fromAddress(debtAddress)
    const dstPublicKey = account.fromAddress(dstAddress)
    const treasuryStakePublicKey = account.fromAddress(treasuryStakeAddress)
    const mintStakePublicKey = account.fromAddress(mintStakeAddress)
    // Get treasurer
    const [treasurerStakeAddress] = await this.deriveFarmTreasurerAddresses(
      farmAddress,
    )
    const treasurerStakePublicKey = account.fromAddress(treasurerStakeAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: InstructionCode.Unstake,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },

        { pubkey: payerPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },

        { pubkey: treasuryStakePublicKey, isSigner: false, isWritable: true },
        { pubkey: mintStakePublicKey, isSigner: false, isWritable: false },
        { pubkey: treasurerStakePublicKey, isSigner: false, isWritable: false },

        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.stakeProgramId,
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
   * Seed more reward to the farm treasury
   * @remarks Owner only
   * @param amount - The number of rewarded tokens that will be seeded
   * @param farmAddress - Farm address
   * @param srcAddress - Source address that sends the rewarded tokens to the farm treasury
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`
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
    const farmPublicKey = account.fromAddress(farmAddress)
    const srcPublicKey = account.fromAddress(srcAddress)
    const treasuryRewardPublicKey = account.fromAddress(treasuryRewardAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: InstructionCode.Seed, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.stakeProgramId,
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
   * @remarks Farm owner only
   * @param amount - The number of rewarded tokens that will be unseeded
   * @param farmAddress - Farm address
   * @param dstAddress - Destination address that receives the rewarded tokens from the farm treasury
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`
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
    const farmPublicKey = account.fromAddress(farmAddress)
    const dstPublicKey = account.fromAddress(dstAddress)
    const treasuryRewardPublicKey = account.fromAddress(treasuryRewardAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Get treasurer
    const [_, treasurerRewardAddress] = await this.deriveFarmTreasurerAddresses(
      farmAddress,
    )
    const treasurerRewardPublicKey = account.fromAddress(treasurerRewardAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: InstructionCode.Unseed, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        {
          pubkey: treasurerRewardPublicKey,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.stakeProgramId,
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
   * Freeze the farm
   * Prevent all functions such as `stake`, `unstake`, and `harvest`
   * @remarks Farm owner only
   * @param farmAddress - Farm address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`
   */
  freeze = async (
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farmaddress')
    const farmPublicKey = account.fromAddress(farmAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: InstructionCode.Freeze,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
      ],
      programId: this.stakeProgramId,
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
   * Thaw the farm
   * @remarks Farm owner only
   * @param farmAddress - Farm address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`
   */
  thaw = async (
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    const farmPublicKey = account.fromAddress(farmAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: InstructionCode.Thaw,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
      ],
      programId: this.stakeProgramId,
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
   * @remarks Farm owner only
   * @param farmAddress - Farm address
   * @param newOwnerAddress - New owner address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`
   */
  transferFarmOwnership = async (
    farmAddress: string,
    newOwnerAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    if (!account.isAddress(newOwnerAddress))
      throw new Error('Invalid new owner address')
    const farmPublicKey = account.fromAddress(farmAddress)
    const newOwnerPublicKey = account.fromAddress(newOwnerAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: InstructionCode.TransferFarmOwnership,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: newOwnerPublicKey, isSigner: false, isWritable: false },
      ],
      programId: this.stakeProgramId,
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

export default Stake
