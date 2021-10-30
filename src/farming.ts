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
  'Must fully harvested first',
  'Must fully unstaked first',
  'Inconsistent treasury balance',
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
    this.farmingProgramId = account.fromAddress(farmingProgramAddress)
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
   * @param watchId - The watchId was returned by {@link https://descartesnetwork.github.io/sen-js/classes/Farming.html#watch | watch} function.
   * @returns
   */
  unwatch = async (watchId: number): Promise<void> => {
    if (!watchId) return
    return await this.connection.removeProgramAccountChangeListener(watchId)
  }

  /**
   * Derive debt address
   * @param ownerAddress - Owner address of the debt account
   * @param farmAddress - Corresponding farm address to the debt account
   * @returns Debt account address
   */
  deriveDebtAddress = async (
    ownerAddress: string,
    farmAddress: string,
  ): Promise<string> => {
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    const ownerPublicKey = account.fromAddress(ownerAddress)
    const farmPublicKey = account.fromAddress(farmAddress)
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
   * @param data - Buffer data (raw data) that you get by {@link https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getAccountInfo | connection.getAccountInfo}
   * @returns Readable json data respect to {@link https://descartesnetwork.github.io/sen-js/modules.html#schema | FARM_SCHEMA}
   */
  parseFarmData = (data: Buffer): FarmData => {
    const layout = new soproxABI.struct(schema.FARM_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get farm data
   * @param farmAddress - Farm account address
   * @returns Readable json data respect to {@link https://descartesnetwork.github.io/sen-js/modules.html#schema | FARM_SCHEMA}
   */
  getFarmData = async (farmAddress: string): Promise<FarmData> => {
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
  parseDebtData = (data: Buffer): DebtData => {
    const layout = new soproxABI.struct(schema.DEBT_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get debt data
   * @param debtAddress - Debt account address
   * @returns Readable json data respect to {@link https://descartesnetwork.github.io/sen-js/modules.html#schema | DEBT_SCHEMA}
   */
  getDebtData = async (debtAddress: string): Promise<DebtData> => {
    if (!account.isAddress(debtAddress)) throw new Error('Invalid debt address')
    const debtPublicKey = account.fromAddress(debtAddress)
    const { data } = (await this.connection.getAccountInfo(debtPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${debtAddress}`)
    return this.parseDebtData(data)
  }

  /**
   * Initialize a farm
   * @param reward - The number of tokens per period
   * @param period - The number of seconds for a reward period
   * @param ownerAddress - Farm owner address
   * @param mintStakeAddress - Mint address for staking
   * @param mintRewardAddress - Mint address for rewarding
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId` and Farm address `farmAddress`
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
    const ownerPublicKey = account.fromAddress(ownerAddress)
    const mintStakePublicKey = account.fromAddress(mintStakeAddress)
    const mintRewardPublicKey = account.fromAddress(mintRewardAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
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
    )
    const treasuryRewardPublicKey = account.fromAddress(
      await this._splt.deriveAssociatedAddress(
        treasurerAddress,
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
   * @param farmAddress - Farm account address
   * @param ownerAddress - Onwer address for the accounts (your wallet address usually)
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`, associated account address to `wallet` for rewarding `rewardedAddress`, and debt account address `debtAddress` 
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
    const ownerPublicKey = account.fromAddress(ownerAddress)
    const farmPublicKey = account.fromAddress(farmAddress)
    const mintRewardPublicKey = account.fromAddress(mintRewardAddress)
    const rewardedPublicKey = account.fromAddress(rewardedAddress)
    const debtPublicKey = account.fromAddress(debtAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
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
   * You stake tokens from the source address, and havest tokens to rewarded address
   * @param amount - The number of staked amount
   * @param srcAddress - Source address that stakes tokens
   * @param rewardedAddress - Rewarded address that receive havested tokens
   * @param farmAddress - Farm address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`, and debt account address `debtAddress`
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
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const {
      treasury_stake: treasuryStakeAddress,
      mint_stake: mintStakeAddress,
      treasury_reward: treasuryRewardAddress,
      mint_reward: mintRewardAddress,
    } = await this.getFarmData(farmAddress)
    const debtAddress = await this.deriveDebtAddress(payerAddress, farmAddress)
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress)
    const srcPublicKey = account.fromAddress(srcAddress)
    const treasuryStakePublicKey = account.fromAddress(treasuryStakeAddress)
    const mintStakePublicKey = account.fromAddress(mintStakeAddress)
    const rewardedPublicKey = account.fromAddress(rewardedAddress)
    const treasuryRewardPublicKey = account.fromAddress(treasuryRewardAddress)
    const mintRewardPublicKey = account.fromAddress(mintRewardAddress)
    const debtPublicKey = account.fromAddress(debtAddress)
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
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },

        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryStakePublicKey, isSigner: false, isWritable: true },
        { pubkey: mintStakePublicKey, isSigner: false, isWritable: false },

        { pubkey: rewardedPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintRewardPublicKey, isSigner: false, isWritable: false },

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
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, debtAddress }
  }

  /**
   * Unstake
   * You unstake tokens and send them to the destination address, and havest tokens to rewarded address
   * @param amount - The number of unstaked amount
   * @param dstAddress - Destination address that receives unstaked tokens
   * @param rewardedAddress - Rewarded address that receive havested tokens
   * @param farmAddress - Farm address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`, and debt account address `debtAddress`
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
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const {
      treasury_stake: treasuryStakeAddress,
      mint_stake: mintStakeAddress,
      treasury_reward: treasuryRewardAddress,
      mint_reward: mintRewardAddress,
    } = await this.getFarmData(farmAddress)
    const debtAddress = await this.deriveDebtAddress(payerAddress, farmAddress)
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress)
    const debtPublicKey = account.fromAddress(debtAddress)
    const dstPublicKey = account.fromAddress(dstAddress)
    const treasuryStakePublicKey = account.fromAddress(treasuryStakeAddress)
    const mintStakePublicKey = account.fromAddress(mintStakeAddress)
    const rewardedPublicKey = account.fromAddress(rewardedAddress)
    const treasuryRewardPublicKey = account.fromAddress(treasuryRewardAddress)
    const mintRewardPublicKey = account.fromAddress(mintRewardAddress)
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
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },

        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryStakePublicKey, isSigner: false, isWritable: true },
        { pubkey: mintStakePublicKey, isSigner: false, isWritable: false },

        { pubkey: rewardedPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintRewardPublicKey, isSigner: false, isWritable: false },

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
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, debtAddress }
  }

  /**
   * Havest
   * You havest rewards and send tokens to the rewarded address
   * @param farmAddress - Farm address
   * @param rewardedAddress - Rewarded address that receive havested tokens
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`, and debt account address `debtAddress`
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
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const {
      treasury_stake: treasuryStakeAddress,
      treasury_reward: treasuryRewardAddress,
      mint_reward: mintRewardAddress,
    } = await this.getFarmData(farmAddress)
    const debtAddress = await this.deriveDebtAddress(payerAddress, farmAddress)
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress)
    const treasuryStakePublicKey = account.fromAddress(treasuryStakeAddress)
    const rewardedPublicKey = account.fromAddress(rewardedAddress)
    const treasuryRewardPublicKey = account.fromAddress(treasuryRewardAddress)
    const mintRewardPublicKey = account.fromAddress(mintRewardAddress)
    const debtPublicKey = account.fromAddress(debtAddress)
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
        { pubkey: treasuryStakePublicKey, isSigner: false, isWritable: false },
        { pubkey: rewardedPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintRewardPublicKey, isSigner: false, isWritable: false },
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
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, debtAddress }
  }

  /**
   * Seed more reward tot the farm treasury
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
   * Close a debt account
   * @param farmAddress - Farm address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`
   */
  closeDebt = async (
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const debtAddress = await this.deriveDebtAddress(payerAddress, farmAddress)
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress)
    const debtPublicKey = account.fromAddress(debtAddress)
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
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`
   */
  closeFarm = async (
    farmAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation
    if (!account.isAddress(farmAddress)) throw new Error('Invalid farm address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const {
      treasury_reward: treasuryRewardAddress,
      mint_reward: mintRewardAddress,
    } = await this.getFarmData(farmAddress)
    const dstRewradAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      mintRewardAddress,
    )
    // Build public keys
    const farmPublicKey = account.fromAddress(farmAddress)
    const treasuryRewardPublicKey = account.fromAddress(treasuryRewardAddress)
    const dstRewardPublicKey = account.fromAddress(dstRewradAddress)
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
      code: 11,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: farmPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstRewardPublicKey, isSigner: false, isWritable: true },
        { pubkey: payerPublicKey, isSigner: false, isWritable: true },
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
}

export default Farming
