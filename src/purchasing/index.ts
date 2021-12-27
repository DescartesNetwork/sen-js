import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from '@solana/web3.js'
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
import schema, { PurchaseOrderData } from '../schema'
import * as Buffer from 'buffer'
import lamports from '../lamports'

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

  placePurchaseOrder = async (
    index: number,
    bidAmount: bigint,
    askAmount: bigint,
    lockedTime: bigint,
    srcBidAddress: string,
    dstAskAddress: string,
    approverAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string, orderAddress: string }> => {

    if (!account.isAddress(srcBidAddress)) throw new Error('Invalid source bid address')

    if (!account.isAddress(dstAskAddress)) throw new Error('Invalid destination ask address')

    if (!account.isAddress(approverAddress)) throw new Error('Invalid approver address')

    const ownerAddress = await wallet.getAddress()

    const ownerPublicKey = account.fromAddress(ownerAddress)

    const approverPublicKey = account.fromAddress(approverAddress)

    const srcBidPublicKey = account.fromAddress(srcBidAddress)

    const { mint: mintBidAddress } = await this._splt.getAccountData(srcBidAddress)
    const mintBidPublicKey = account.fromAddress(mintBidAddress)

    const dstAskPublicKey = account.fromAddress(dstAskAddress)

    const { mint: mintAskAddress } = await this._splt.getAccountData(dstAskAddress)
    const mintAskPublicKey = account.fromAddress(mintAskAddress)

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
        { pubkey: orderPublicKey, isSigner: false, isWritable: true },
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

    return Promise.resolve({ txId: '', orderAddress: '' })
  }

  rejectPurchaseOrder = async (
    purchaseOrderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(purchaseOrderAddress)) throw new Error('Invalid purchase order address')
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

  approvePurchaseOrder = async (
    purchaseOrderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    const orderData = await this.getPurchaseOrderData(purchaseOrderAddress)
    return Promise.resolve({ txId: '', orderAddress: '' })
  }

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
      { code: InstructionCode.RedeemPurchaseOrder },
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
}

export default Purchasing