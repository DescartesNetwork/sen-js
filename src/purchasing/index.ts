import {
  GetProgramAccountsFilter, KeyedAccountInfo,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import Tx from '../core/tx'
import SPLT from '../splt'
import { InstructionCode, ErrorMapping } from './constant'
import account from '../account'
import {
  DEFAULT_PURCHASING_PROGRAM_ADDRESS, DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_STAKE_PROGRAM_ADDRESS,
} from '../default'
import { WalletInterface } from '../rawWallet'
import schema, { PurchaseOrderData, StakeDebtData, StakeFarmData } from '../schema'
import * as Buffer from 'buffer'
import { uint32ToBuffer } from '../stake/util'
import { StakeAccountChangeInfo } from '../stake'

const soproxABI = require('soprox-abi')

class Purchasing extends Tx {
  private _splt: SPLT

  purchasingProgramId: PublicKey
  spltProgramId: PublicKey
  splataProgramId: PublicKey

  constructor(
    purchasingProgramAddress = DEFAULT_PURCHASING_PROGRAM_ADDRESS,
    spltProgramAddress = DEFAULT_SPLT_PROGRAM_ADDRESS,
    splataProgramAddress = DEFAULT_SPLATA_PROGRAM_ADDRESS,
    nodeUrl: string,
  ) {
    super(nodeUrl, ErrorMapping)

    if (!account.isAddress(purchasingProgramAddress))
      throw new Error('Invalid stake program address')
    if (!account.isAddress(spltProgramAddress))
      throw new Error('Invalid SPL token program address')
    if (!account.isAddress(splataProgramAddress))
      throw new Error('Invalid SPL associated token program address')

    this.purchasingProgramId = account.fromAddress(purchasingProgramAddress)
    this.spltProgramId = account.fromAddress(purchasingProgramAddress)
    this.splataProgramId = account.fromAddress(purchasingProgramAddress)
    this._splt = new SPLT(spltProgramAddress, splataProgramAddress, nodeUrl)
  }

  parsePurchaseOrderData = (data: Buffer): PurchaseOrderData => {
    const layout = new soproxABI.struct(schema.STAKE_PURCHASE_ORDER_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  getPurchaseOrderData = async (purchaseOrderAddress: string): Promise<PurchaseOrderData> => {
    if (!account.isAddress(purchaseOrderAddress)) throw new Error('Invalid farm address')
    const purchaseOrderPublicKey = account.fromAddress(purchaseOrderAddress)
    const { data } = (await this.connection.getAccountInfo(purchaseOrderPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${purchaseOrderAddress}`)
    return this.parsePurchaseOrderData(data)
  }

  /**
   *
   * @param index
   * @param ownerAddress is a person who want to place a new purchase order
   * @param approverAddress is a person who can approve/reject purchase orders (maybe administrator of the system)
   * @param mintBidAddress is token that owner want to sell
   * @param mintAskAddress is token that owner want to receive
   */
  derivePurchaseOrderAddress = async (
    index: number,
    ownerAddress: string,
    approverAddress: string,
    mintBidAddress: string,
    mintAskAddress: string,
  ): Promise<string> => {
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    if (!account.isAddress(approverAddress))
      throw new Error('Invalid approver address')
    if (!account.isAddress(mintBidAddress))
      throw new Error('Invalid mint bid address')
    if (!account.isAddress(mintAskAddress))
      throw new Error('Invalid mint ask address')

    const ownerPublicKey = account.fromAddress(ownerAddress)
    const approverPublicKey = account.fromAddress(approverAddress)
    const mintBidPublicKey = account.fromAddress(mintBidAddress)
    const mintAskPublicKey = account.fromAddress(mintAskAddress)

    const seeds = [
      uint32ToBuffer(index),
      ownerPublicKey.toBuffer(),
      approverPublicKey.toBuffer(),
      mintBidPublicKey.toBuffer(),
      mintAskPublicKey.toBuffer(),
      this.purchasingProgramId.toBuffer(),
    ]

    const [purchaseOrderPublicKey, _] = await PublicKey.findProgramAddress(
      seeds,
      this.purchasingProgramId,
    )
    return purchaseOrderPublicKey.toBase58()
  }

  /**
   *
   * @param index
   * @param bidAmount
   * @param askAmount
   * @param lockedTime
   * @param srcBidAddress
   * @param dstAskAddress
   * @param approverAddress
   * @param wallet
   */
  placePurchaseOrder = async (
    index: number,
    bidAmount: bigint,
    askAmount: bigint,
    lockedTime: bigint,
    srcBidAddress: string,
    dstAskAddress: string,
    approverAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string, purchaseOrderAddress: string }> => {

    if (!account.isAddress(srcBidAddress))
      throw new Error('Invalid source bid address')

    if (!account.isAddress(dstAskAddress))
      throw new Error('Invalid destination ask address')

    if (!account.isAddress(approverAddress))
      throw new Error('Invalid approver address')

    if (bidAmount <= 0)
      throw new Error('Invalid bid amount')

    if (askAmount <= 0)
      throw new Error('Invalid ask amount')

    if (lockedTime <= 0)
      throw new Error('Invalid locked time')

    const ownerAddress = await wallet.getAddress()
    const ownerPublicKey = account.fromAddress(ownerAddress)

    const approverPublicKey = account.fromAddress(approverAddress)

    const srcBidPublicKey = account.fromAddress(srcBidAddress)
    const { mint: mintBidAddress } = await this._splt.getAccountData(srcBidAddress)
    const mintBidPublicKey = account.fromAddress(mintBidAddress)

    const dstAskPublicKey = account.fromAddress(dstAskAddress)
    const { mint: mintAskAddress } = await this._splt.getAccountData(dstAskAddress)
    const mintAskPublicKey = account.fromAddress(mintAskAddress)

    const purchaseOrderAddress = await this.derivePurchaseOrderAddress(
      index,
      ownerAddress,
      approverAddress,
      mintBidAddress,
      mintAskAddress,
    )
    const purchaseOrderPublicKey = account.fromAddress(purchaseOrderAddress)

    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'index', type: 'u32' },
        { key: 'bid_amount', type: 'u64' },
        { key: 'ask_amount', type: 'u64' },
        { key: 'locked_time', type: 'i64' },
      ],
      {
        code: InstructionCode.PlacePurchaseOrder.valueOf(),
        index: index,
        bid_amount: bidAmount,
        ask_amount: askAmount,
        locked_time: lockedTime,
      },
    )

    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: ownerPublicKey, isSigner: true, isWritable: true },
        { pubkey: purchaseOrderPublicKey, isSigner: false, isWritable: true },
        { pubkey: approverPublicKey, isSigner: false, isWritable: true },

        { pubkey: mintBidPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcBidPublicKey, isSigner: false, isWritable: true },

        { pubkey: mintAskPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstAskPublicKey, isSigner: false, isWritable: true },

        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: this.purchasingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = ownerPublicKey

    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)

    const txId = await this.sendTransaction(transaction)
    return { txId, purchaseOrderAddress }
  }

  /**
   *
   * @param purchaseOrderAddress
   * @param wallet
   */
  rejectPurchaseOrder = async (
    purchaseOrderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(purchaseOrderAddress))
      throw new Error('Invalid purchase order address')

    const purchaseOrderPublicKey = account.fromAddress(purchaseOrderAddress)

    const approverAddress = await wallet.getAddress()
    const approverPublicKey = account.fromAddress(approverAddress)

    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)

    const layout = new soproxABI.struct(
      [{ key: 'code', type: 'u8' }],
      { code: InstructionCode.RejectPurchaseOrder },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: approverPublicKey, isSigner: true, isWritable: true },
        { pubkey: purchaseOrderPublicKey, isSigner: false, isWritable: false },
      ],
      programId: this.purchasingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = approverPublicKey

    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)

    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   *
   * @param purchaseOrderAddress
   * @param ownerAddress
   * @param srcBidAddress
   * @param treasuryBidAddress
   * @param wallet
   */
  approvePurchaseOrder = async (
    purchaseOrderAddress: string,
    ownerAddress: string,
    srcBidAddress: string,
    treasuryBidAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(purchaseOrderAddress))
      throw new Error('Invalid purchase order address')

    const purchaseOrderPublicKey = account.fromAddress(purchaseOrderAddress)

    const approverAddress = await wallet.getAddress()
    const approverPublicKey = account.fromAddress(approverAddress)

    const ownerPublicKey = account.fromAddress(ownerAddress)

    const srcBidPublicKey = account.fromAddress(srcBidAddress)

    const { mint: mintBidAddress } = await this._splt.getAccountData(srcBidAddress)
    const mintBidPublicKey = account.fromAddress(mintBidAddress)

    const treasuryBidPublicKey = account.fromAddress(treasuryBidAddress)

    const { mint: mintTreasuryBidAddress } = await this._splt.getAccountData(treasuryBidAddress)

    if (mintBidAddress != mintTreasuryBidAddress)
      throw new Error('Bid mint is not matching')

    // transaction builder
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)

    const layout = new soproxABI.struct(
      [{ key: 'code', type: 'u8' }],
      { code: InstructionCode.ApprovePurchaseOrder },
    )

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: approverPublicKey, isSigner: true, isWritable: true },
        { pubkey: purchaseOrderPublicKey, isSigner: false, isWritable: false },
        { pubkey: ownerPublicKey, isSigner: false, isWritable: false },
        { pubkey: mintBidPublicKey, isSigner: false, isWritable: false },
        { pubkey: srcBidPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryBidPublicKey, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.purchasingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = approverPublicKey

    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)

    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   *
   * @param purchaseOrderAddress
   * @param wallet
   */
  cancelPurchaseOrder = async (
    purchaseOrderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(purchaseOrderAddress))
      throw new Error('Invalid purchase order address')

    const purchaseOrderPublicKey = account.fromAddress(purchaseOrderAddress)

    const ownerAddress = await wallet.getAddress()
    const ownerPublicKey = account.fromAddress(ownerAddress)

    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)

    const layout = new soproxABI.struct(
      [{ key: 'code', type: 'u8' }],
      { code: InstructionCode.CancelPurchaseOrder },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: ownerPublicKey, isSigner: true, isWritable: true },
        { pubkey: purchaseOrderPublicKey, isSigner: false, isWritable: false },
      ],
      programId: this.purchasingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = ownerPublicKey

    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)

    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  redeemPurchaseOrder = async (
    purchaseOrderAddress: string,
    dstAskAddress: string,
    treasuryAskAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(purchaseOrderAddress))
      throw new Error('Invalid purchase order address')

    if (!account.isAddress(dstAskAddress))
      throw new Error('Invalid destination ask address')

    const purchaseOrderPublicKey = account.fromAddress(purchaseOrderAddress)

    const dstAskPublicKey = account.fromAddress(dstAskAddress)

    const { mint: mintAskAddress } = await this._splt.getAccountData(dstAskAddress)
    const mintAskPublicKey = account.fromAddress(mintAskAddress)

    const treasuryAskPublicKey = account.fromAddress(treasuryAskAddress)

    const ownerAddress = await wallet.getAddress()
    const ownerPublicKey = account.fromAddress(ownerAddress)

    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)

    const layout = new soproxABI.struct(
      [{ key: 'code', type: 'u8' }],
      { code: InstructionCode.RedeemPurchaseOrder },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: ownerPublicKey, isSigner: true, isWritable: true },
        { pubkey: purchaseOrderPublicKey, isSigner: false, isWritable: false },

        { pubkey: mintAskPublicKey, isSigner: false, isWritable: false },
        { pubkey: dstAskPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryAskPublicKey, isSigner: false, isWritable: false },

        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.purchasingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = ownerPublicKey

    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)

    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }
}

export default Purchasing