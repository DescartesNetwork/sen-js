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
import schema, { AccountData, DebtData, StakePoolData } from './schema'
import {
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_FARMING_PROGRAM_ADDRESS,
} from './default'
import { WalletInterface } from './rawWallet'

const soproxABI = require('soprox-abi')
const xor = require('buffer-xor')

export type FarmingAccountChangeInfo = {
  type: 'stake_pool'
  address: string
  data: Buffer
}

const ErrorMapping = [
  'Invalid instruction',
  'Invalid owner',
  'Incorrect program id',
  'Already constructed',
  'Operation overflowed',
  'Pool unmatched',
  'Pool frozen',
  'Zero value',
  'Insufficient funds',
  'Invalid mint',
  'Exceed limit',
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
        | (Omit<FarmingAccountChangeInfo, 'data'> & { data: StakePoolData })
        | null,
    ) => void,
    filters?: GetProgramAccountsFilter[],
  ): number => {
    const cb = ({
      accountId,
      accountInfo: { data: buf },
    }: KeyedAccountInfo) => {
      const address = accountId.toBase58()
      const stakePoolSpace = new soproxABI.struct(schema.STAKE_POOL_SCHEMA)
        .space
      let type = null
      let data = {}
      if (buf.length === stakePoolSpace) {
        type = 'stake_pool'
        data = this.parseStakePoolData(buf)
      }
      if (!type) return callback('Unmatched type', null)
      return callback(null, {
        type: type as FarmingAccountChangeInfo['type'],
        address,
        data: data as StakePoolData,
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
   * Generate a proof address
   * The share mints is seperated to spl mints by its freeze authority
   * The share mint's freeze authority is assigned to the proof address
   * @param stakePoolAddress
   * @returns A corresponding proof address to a stake pool address
   */
  private genProofAddress = async (
    stakePoolAddress: string,
  ): Promise<string> => {
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
    const seed = [stakePoolPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.farmingProgramId,
    )
    const proof = new PublicKey(
      xor(
        this.farmingProgramId.toBuffer(),
        xor(stakePoolPublicKey.toBuffer(), treasurerPublicKey.toBuffer()),
      ),
    )
    return proof.toBase58()
  }

  /**
   * Derive the corresponding stake pool address to the splt mint
   * @param mintAuthorityAddress
   * @param freezeAuthorityAddress
   * @returns
   */
  deriveStakePoolAddress = async (
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
    ) as PublicKey // Proof of mint share
    const stakePoolPublicKey = new PublicKey(
      xor(
        this.farmingProgramId.toBuffer(),
        xor(
          freezeAuthorityPublicKey.toBuffer(),
          mintAuthorityPublicKey.toBuffer(),
        ),
      ),
    )
    const seed = [stakePoolPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.farmingProgramId,
    )
    if (treasurerPublicKey.toBase58() != mintAuthorityPublicKey.toBase58())
      return undefined
    return stakePoolPublicKey.toBase58()
  }

  /**
   * Derive debt address
   * @param ownerAddress
   * @param stakePoolAddress
   * @returns
   */
  deriveDebtAddress = async (
    ownerAddress: string,
    stakePoolAddress: string,
  ): Promise<string> => {
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    const ownerPublicKey = account.fromAddress(ownerAddress) as PublicKey
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
    const seeds = [
      ownerPublicKey.toBuffer(),
      stakePoolPublicKey.toBuffer(),
      this.farmingProgramId.toBuffer(),
    ]
    const [debtPublicKey, _] = await PublicKey.findProgramAddress(
      seeds,
      this.farmingProgramId,
    )
    return debtPublicKey.toBase58()
  }

  /**
   * Find share & debt address
   * @param data
   * @returns
   */
  private findShareAndDebtAddress = async (
    stakePoolAddress: string,
    mintShareAddress: string,
    ownerAddress: string,
  ): Promise<{ shareAddress: string; debtAddress: string }> => {
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    if (!account.isAddress(mintShareAddress))
      throw new Error('Invalid mint share address')
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    // Get share account
    const shareAddress = await this._splt.deriveAssociatedAddress(
      ownerAddress,
      mintShareAddress,
    )
    if (!account.isAddress(shareAddress))
      throw new Error('Invalid share address')
    // Get debt account
    const debtAddress = await this.deriveDebtAddress(
      ownerAddress,
      stakePoolAddress,
    )
    if (!account.isAddress(debtAddress)) throw new Error('Invalid debt address')
    return { shareAddress, debtAddress }
  }

  /**
   * Parse stake pool buffer data
   * @param data
   * @returns
   */
  parseStakePoolData = (data: Buffer): StakePoolData => {
    const layout = new soproxABI.struct(schema.STAKE_POOL_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get stake pool data
   * @param stakePoolAddress
   * @returns
   */
  getStakePoolData = async (
    stakePoolAddress: string,
  ): Promise<StakePoolData> => {
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
    const { data } =
      (await this.connection.getAccountInfo(stakePoolPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${stakePoolAddress}`)
    return this.parseStakePoolData(data)
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
   * Parse share buffer data
   * @param data
   * @returns
   */
  parseShareData = (data: Buffer): AccountData => {
    const layout = new soproxABI.struct(schema.ACCOUNT_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get share data
   * Indentical to get account (SPLT) data, but with stake pool check
   * @param lptAddress
   * @returns
   */
  getShareData = async (
    shareAddress: string,
  ): Promise<AccountData & { stakePool: string }> => {
    if (!account.isAddress(shareAddress))
      throw new Error('Invalid share address')
    const sharePublicKey = account.fromAddress(shareAddress) as PublicKey
    const { data } =
      (await this.connection.getAccountInfo(sharePublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${shareAddress}`)
    const shareData = this.parseShareData(data)
    const { mint: mintAddress } = shareData
    const { mint_authority, freeze_authority } = await this._splt.getMintData(
      mintAddress,
    )
    const stakePoolAddress = await this.deriveStakePoolAddress(
      mint_authority,
      freeze_authority,
    )
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    return { ...shareData, stakePool: stakePoolAddress as string }
  }

  /**
   * Initialize a stake pool
   * @param reward
   * @param period seconds
   * @param ownerAddress
   * @param mintDepositAddress
   * @param mintRewardAddress
   * @param wallet
   * @returns
   */
  initializeStakePool = async (
    reward: bigint,
    period: bigint,
    ownerAddress: string,
    mintDepositAddress: string,
    mintRewardAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    mintShareAddress: string
    stakePoolAddress: string
  }> => {
    // Validation
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    if (!account.isAddress(mintDepositAddress))
      throw new Error('Invalid mint deposit address')
    if (!account.isAddress(mintRewardAddress))
      throw new Error('Invalid mint reward address')
    // Fetch necessary info
    const mintShare = account.createAccount()
    const mintShareAddress = mintShare.publicKey.toBase58()
    const stakePool = await account.createStrictAccount(this.farmingProgramId)
    const stakePoolAddress = stakePool.publicKey.toBase58()
    // Build public keys
    const ownerPublicKey = account.fromAddress(ownerAddress) as PublicKey
    const mintDepositPublicKey = account.fromAddress(
      mintDepositAddress,
    ) as PublicKey
    const mintRewardPublicKey = account.fromAddress(
      mintRewardAddress,
    ) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Get treasurer
    const seed = [stakePool.publicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.farmingProgramId,
    )
    const treasurerAddress = treasurerPublicKey.toBase58()
    // Get treasuries
    const treasuryDepositPublicKey = account.fromAddress(
      await this._splt.deriveAssociatedAddress(
        treasurerAddress,
        mintDepositAddress,
      ),
    ) as PublicKey
    const treasuryRewardPublicKey = account.fromAddress(
      await this._splt.deriveAssociatedAddress(
        treasurerAddress,
        mintRewardAddress,
      ),
    ) as PublicKey
    // Generate proof
    const proofAddress = await this.genProofAddress(
      stakePool.publicKey.toBase58(),
    )
    const proofPublicKey = account.fromAddress(proofAddress) as PublicKey
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
        { pubkey: stakePool.publicKey, isSigner: true, isWritable: true },
        { pubkey: mintShare.publicKey, isSigner: true, isWritable: true },
        { pubkey: proofPublicKey, isSigner: false, isWritable: false },
        { pubkey: mintDepositPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryDepositPublicKey, isSigner: false, isWritable: true },
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
    const stakePoolSig = await this.selfSign(transaction, stakePool)
    this.addSignature(transaction, stakePoolSig)
    const mintShareSig = await this.selfSign(transaction, mintShare)
    this.addSignature(transaction, mintShareSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, mintShareAddress, stakePoolAddress }
  }

  /**
   * Initialize account including share and debt
   * @param stakePoolAddress
   * @param ownerAddress
   * @param wallet
   * @returns
   */
  initializeAccount = async (
    stakePoolAddress: string,
    ownerAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; shareAddress: string; debtAddress: string }> => {
    // Validation
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    // Fetch necessary info
    const { mint_share: mintShareAddress } = await this.getStakePoolData(
      stakePoolAddress,
    )
    const { shareAddress, debtAddress } = await this.findShareAndDebtAddress(
      stakePoolAddress,
      mintShareAddress,
      ownerAddress,
    )
    // Build public keys
    const ownerPublicKey = account.fromAddress(ownerAddress) as PublicKey
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
    const mintSharePublicKey = account.fromAddress(
      mintShareAddress,
    ) as PublicKey
    const sharePublicKey = account.fromAddress(shareAddress) as PublicKey
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
        { pubkey: stakePoolPublicKey, isSigner: false, isWritable: false },
        { pubkey: mintSharePublicKey, isSigner: false, isWritable: false },

        { pubkey: sharePublicKey, isSigner: false, isWritable: true },
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
    return { txId, shareAddress, debtAddress }
  }

  /**
   * Stake
   * You stake tokens from the source address and havest SEN to rewarded address
   * @param amount
   * @param srcAddress Source address that deposit tokens
   * @param rewardedAddress Rewarded address that receive havested SEN
   * @param stakePoolAddress
   * @param wallet
   * @returns
   */
  stake = async (
    amount: bigint,
    srcAddress: string,
    rewardedAddress: string,
    stakePoolAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; shareAddress: string; debtAddress: string }> => {
    // Validation
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(rewardedAddress))
      throw new Error('Invalid rewarded address')
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const {
      mint_share: mintShareAddress,
      treasury_token: treasuryTokenAddress,
      treasury_sen: treasurySenAddress,
    } = await this.getStakePoolData(stakePoolAddress)
    const { shareAddress, debtAddress } = await this.findShareAndDebtAddress(
      stakePoolAddress,
      mintShareAddress,
      payerAddress,
    )
    // Build public keys
    const srcPublicKey = account.fromAddress(srcAddress) as PublicKey
    const rewardedPublicKey = account.fromAddress(rewardedAddress) as PublicKey
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
    const mintSharePublicKey = account.fromAddress(
      mintShareAddress,
    ) as PublicKey
    const treasuryTokenPublicKey = account.fromAddress(
      treasuryTokenAddress,
    ) as PublicKey
    const treasurySenPublicKey = account.fromAddress(
      treasurySenAddress,
    ) as PublicKey
    const sharePublicKey = account.fromAddress(shareAddress) as PublicKey
    const debtPublicKey = account.fromAddress(debtAddress) as PublicKey
    // Get treasurer
    const seed = [stakePoolPublicKey.toBuffer()]
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
        { pubkey: stakePoolPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintSharePublicKey, isSigner: false, isWritable: true },

        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryTokenPublicKey, isSigner: false, isWritable: true },

        { pubkey: sharePublicKey, isSigner: false, isWritable: true },
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },

        { pubkey: rewardedPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurySenPublicKey, isSigner: false, isWritable: true },

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
    return { txId, shareAddress, debtAddress }
  }

  /**
   * Unstake
   * You unstake tokens to the destination address and havest SEN to rewarded address
   * @param amount
   * @param dstAddress
   * @param rewardedAddress
   * @param stakePoolAddress
   * @param wallet
   * @returns
   */
  unstake = async (
    amount: bigint,
    dstAddress: string,
    rewardedAddress: string,
    stakePoolAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string; shareAddress: string; debtAddress: string }> => {
    // Validation
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    if (!account.isAddress(rewardedAddress))
      throw new Error('Invalid rewarded address')
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const {
      mint_share: mintShareAddress,
      treasury_token: treasuryTokenAddress,
      treasury_sen: treasurySenAddress,
    } = await this.getStakePoolData(stakePoolAddress)
    const { shareAddress, debtAddress } = await this.findShareAndDebtAddress(
      stakePoolAddress,
      mintShareAddress,
      payerAddress,
    )
    // Build public keys
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
    const dstPublicKey = account.fromAddress(dstAddress) as PublicKey
    const rewardedPublicKey = account.fromAddress(rewardedAddress) as PublicKey
    const mintSharePublicKey = account.fromAddress(
      mintShareAddress,
    ) as PublicKey
    const treasuryTokenPublicKey = account.fromAddress(
      treasuryTokenAddress,
    ) as PublicKey
    const treasurySenPublicKey = account.fromAddress(
      treasurySenAddress,
    ) as PublicKey
    const sharePublicKey = account.fromAddress(shareAddress) as PublicKey
    const debtPublicKey = account.fromAddress(debtAddress) as PublicKey
    // Get treasurer
    const seed = [stakePoolPublicKey.toBuffer()]
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
        { pubkey: stakePoolPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintSharePublicKey, isSigner: false, isWritable: true },

        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasuryTokenPublicKey, isSigner: false, isWritable: true },

        { pubkey: sharePublicKey, isSigner: false, isWritable: true },
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },

        { pubkey: rewardedPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurySenPublicKey, isSigner: false, isWritable: true },

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
    return { txId, shareAddress, debtAddress }
  }

  /**
   * Havest
   * @param stakePoolAddress
   * @param rewardedAddress
   * @param wallet
   * @returns
   */
  harvest = async (
    stakePoolAddress: string,
    rewardedAddress: string,
    wallet: WalletInterface,
  ) => {
    // Validation
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    if (!account.isAddress(rewardedAddress))
      throw new Error('Invalid rewarded address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const { mint_share: mintShareAddress, treasury_sen: treasurySenAddress } =
      await this.getStakePoolData(stakePoolAddress)
    const { shareAddress, debtAddress } = await this.findShareAndDebtAddress(
      stakePoolAddress,
      mintShareAddress,
      payerAddress,
    )
    // Build public keys
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
    const rewardedPublicKey = account.fromAddress(rewardedAddress) as PublicKey
    const mintSharePublicKey = account.fromAddress(
      mintShareAddress,
    ) as PublicKey
    const treasurySenPublicKey = account.fromAddress(
      treasurySenAddress,
    ) as PublicKey
    const sharePublicKey = account.fromAddress(shareAddress) as PublicKey
    const debtPublicKey = account.fromAddress(debtAddress) as PublicKey
    // Get treasurer
    const seed = [stakePoolPublicKey.toBuffer()]
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
        { pubkey: stakePoolPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintSharePublicKey, isSigner: false, isWritable: true },

        { pubkey: sharePublicKey, isSigner: false, isWritable: true },
        { pubkey: debtPublicKey, isSigner: false, isWritable: true },

        { pubkey: rewardedPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurySenPublicKey, isSigner: false, isWritable: true },

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
    return { txId, shareAddress, debtAddress }
  }

  /**
   * Seed more reward
   * @param amount
   * @param stakePoolAddress
   * @param srcAddress
   * @param wallet
   * @returns
   */
  seed = async (
    amount: bigint,
    stakePoolAddress: string,
    srcAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    // Fetch necessary info
    const { treasury_sen: treasurySenAddress } = await this.getStakePoolData(
      stakePoolAddress,
    )
    // Build public keys
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
    const srcPublicKey = account.fromAddress(srcAddress) as PublicKey
    const treasurySenPublicKey = account.fromAddress(
      treasurySenAddress,
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
        { pubkey: stakePoolPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurySenPublicKey, isSigner: false, isWritable: true },
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
   * @param stakePoolAddress
   * @param dstAddress
   * @param wallet
   * @returns
   */
  unseed = async (
    amount: bigint,
    stakePoolAddress: string,
    dstAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    // Fetch necessary info
    const { treasury_sen: treasurySenAddress } = await this.getStakePoolData(
      stakePoolAddress,
    )
    // Build public keys
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
    const dstSenPublicKey = account.fromAddress(dstAddress) as PublicKey
    const treasurySenPublicKey = account.fromAddress(
      treasurySenAddress,
    ) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Get treasurer
    const seed = [stakePoolPublicKey.toBuffer()]
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
        { pubkey: stakePoolPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstSenPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurySenPublicKey, isSigner: false, isWritable: true },
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
   * Freeze a stake pool
   * @param stakePoolAddress
   * @param wallet
   * @returns
   */
  freezeStakePool = async (
    stakePoolAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
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
        { pubkey: stakePoolPublicKey, isSigner: false, isWritable: true },
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
   * Thaw a stake pool
   * @param stakePoolAddress
   * @param wallet
   * @returns
   */
  thawStakePool = async (
    stakePoolAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
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
        { pubkey: stakePoolPublicKey, isSigner: false, isWritable: true },
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
   * Close share account
   * @param shareAddress
   * @param wallet
   * @returns
   */
  closeShare = async (
    stakePoolAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: String }> => {
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    const { mint_share: mintShareAddress } = await this.getStakePoolData(
      stakePoolAddress,
    )
    const ownerAddress = await wallet.getAddress()
    const { shareAddress } = await this.findShareAndDebtAddress(
      stakePoolAddress,
      mintShareAddress,
      ownerAddress,
    )
    return await this._splt.closeAccount(shareAddress, wallet)
  }

  /**
   * Transfer stake pool's ownership
   * @param stakePoolAddress
   * @param newOwnerAddress
   * @param wallet
   * @returns
   */
  transferStakePoolOwnership = async (
    stakePoolAddress: string,
    newOwnerAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    if (!account.isAddress(newOwnerAddress))
      throw new Error('Invalid new owner address')
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
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
        { pubkey: stakePoolPublicKey, isSigner: false, isWritable: true },
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
   * @param stakePoolAddress
   * @param wallet
   * @returns
   */
  closeDebt = async (
    stakePoolAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Fetch necessary info
    const { mint_share: mintShareAddress } = await this.getStakePoolData(
      stakePoolAddress,
    )
    const { shareAddress, debtAddress } = await this.findShareAndDebtAddress(
      stakePoolAddress,
      mintShareAddress,
      payerAddress,
    )
    // Build public keys
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
    const sharePublicKey = account.fromAddress(shareAddress) as PublicKey
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
        { pubkey: stakePoolPublicKey, isSigner: false, isWritable: false },
        { pubkey: sharePublicKey, isSigner: false, isWritable: false },
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
   * Close a stake pool
   * @param stakePoolAddress
   * @param wallet
   * @returns
   */
  closeStakePool = async (
    stakePoolAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    // Validation
    if (!account.isAddress(stakePoolAddress))
      throw new Error('Invalid stake pool address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress) as PublicKey
    // Build public keys
    const stakePoolPublicKey = account.fromAddress(
      stakePoolAddress,
    ) as PublicKey
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 11,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: stakePoolPublicKey, isSigner: false, isWritable: false },
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
