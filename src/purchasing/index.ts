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
  DEFAULT_PURCHASING_PROGRAM_ADDRESS,
  DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_SPLT_PROGRAM_ADDRESS,
} from '../default'
import { WalletInterface } from '../rawWallet'
import schema, { OrderData, RetailerData, StakeDebtData, StakeFarmData } from '../schema'
import * as Buffer from 'buffer'
import { genRetailerAccount, uint32ToBuffer } from './util'
import { genFarmAccount } from '../stake/util'

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

  parseRetailerData = (data: Buffer): RetailerData => {
    const layout = new soproxABI.struct(schema.RETAILER_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  getRetailerData = async (retailerAddress: string): Promise<RetailerData> => {
    if (!account.isAddress(retailerAddress)) throw new Error('Invalid retailer address')
    const retailerPublicKey = account.fromAddress(retailerAddress)
    const { data } = (await this.connection.getAccountInfo(retailerPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${retailerAddress}`)
    return this.parseRetailerData(data)
  }

  parseOrderData = (data: Buffer): OrderData => {
    const layout = new soproxABI.struct(schema.ORDER_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  getOrderData = async (orderAddress: string): Promise<OrderData> => {
    if (!account.isAddress(orderAddress)) throw new Error('Invalid farm address')
    const orderPublicKey = account.fromAddress(orderAddress)
    const { data } = (await this.connection.getAccountInfo(orderPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${orderAddress}`)
    return this.parseOrderData(data)
  }

  private deriveRetailerTreasurerAddresses = async (
    retailerAddress: string,
  ): Promise<[string, string]> => {
    if (!account.isAddress(retailerAddress)) throw new Error('Invalid retailer address')

    const retailerPublicKey = account.fromAddress(retailerAddress)

    const treasurerBidPublicKey = await PublicKey.createProgramAddress(
      [uint32ToBuffer(0), retailerPublicKey.toBuffer()],
      this.purchasingProgramId,
    )
    const treasurerAskPublicKey = await PublicKey.createProgramAddress(
      [uint32ToBuffer(1), retailerPublicKey.toBuffer()],
      this.purchasingProgramId,
    )
    return [
      treasurerBidPublicKey.toBase58(),
      treasurerAskPublicKey.toBase58(),
    ]
  }

  /**
   *
   * @param ownerAddress
   * @param mintBidAddress
   * @param mintAskAddress
   * @param wallet
   */
  initializeRetailer = async (
    ownerAddress: string,
    mintBidAddress: string,
    mintAskAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    retailerAddress: string
  }> => {
    if (!account.isAddress(mintBidAddress))
      throw new Error('Invalid mint bid address')
    if (!account.isAddress(mintAskAddress))
      throw new Error('Invalid mint ask address')

    const retailer = await genRetailerAccount(this.purchasingProgramId)
    const retailerAddress = retailer.publicKey.toBase58()

    // Build public keys
    const ownerPublicKey = account.fromAddress(ownerAddress)
    const mintBidPublicKey = account.fromAddress(mintBidAddress)
    const mintAskPublicKey = account.fromAddress(mintAskAddress)

    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)

    // Get treasurers & treasuries
    const [treasurerBidAddress, treasurerAskAddress] =
      await this.deriveRetailerTreasurerAddresses(retailerAddress)

    const treasurerBidPublicKey = account.fromAddress(treasurerBidAddress)
    const treasurerAskPublicKey = account.fromAddress(treasurerAskAddress)

    const treasuryBidPublicKey = account.fromAddress(
      await this._splt.deriveAssociatedAddress(
        treasurerBidAddress,
        mintBidAddress,
      ),
    )
    const treasuryAskPublicKey = account.fromAddress(
      await this._splt.deriveAssociatedAddress(
        treasurerAskAddress,
        mintAskAddress,
      ),
    )

    // transaction builder
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
      ],
      {
        code: InstructionCode.InitializeRetailer,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: ownerPublicKey, isSigner: false, isWritable: false },
        { pubkey: retailer.publicKey, isSigner: true, isWritable: true },

        { pubkey: mintBidPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryBidPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerBidPublicKey, isSigner: false, isWritable: false },

        { pubkey: mintAskPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryAskPublicKey, isSigner: false, isWritable: true },
        { pubkey: treasurerAskPublicKey, isSigner: false, isWritable: false },

        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.purchasingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey

    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    const retailerSig = await this.selfSign(transaction, retailer)
    this.addSignature(transaction, retailerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, retailerAddress }
  }

  /**
   *
   * @param retailerAddress
   * @param wallet
   */
  freezeRetailer = async (
    retailerAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(retailerAddress))
      throw new Error('Invalid retailer address')
    const retailerPublicKey = account.fromAddress(retailerAddress)

    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)

    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [{ key: 'code', type: 'u8' }],
      {
        code: InstructionCode.FreezeRetailer,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: retailerPublicKey, isSigner: false, isWritable: true },
      ],
      programId: this.purchasingProgramId,
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
   *
   * @param retailerAddress
   * @param wallet
   */
  thawRetailer = async (
    retailerAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(retailerAddress))
      throw new Error('Invalid retailer address')
    const retailerPublicKey = account.fromAddress(retailerAddress)

    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)

    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [{ key: 'code', type: 'u8' }],
      {
        code: InstructionCode.ThawRetailer,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: retailerPublicKey, isSigner: false, isWritable: true },
      ],
      programId: this.purchasingProgramId,
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
   *
   * @param index
   * @param ownerAddress is a person who want to place a new order
   * @param retailerAddress
   */
  deriveOrderAddress = async (
    index: number,
    ownerAddress: string,
    retailerAddress: string,
  ): Promise<string> => {
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    if (!account.isAddress(retailerAddress))
      throw new Error('Invalid retailer address')

    const ownerPublicKey = account.fromAddress(ownerAddress)
    const retailerPublicKey = account.fromAddress(retailerAddress)

    const seeds = [
      uint32ToBuffer(index),
      ownerPublicKey.toBuffer(),
      retailerPublicKey.toBuffer(),
      this.purchasingProgramId.toBuffer(),
    ]

    const [orderPublicKey, _] = await PublicKey.findProgramAddress(
      seeds,
      this.purchasingProgramId,
    )
    return orderPublicKey.toBase58()
  }

  /**
   *
   * @param index
   * @param bidAmount
   * @param askAmount
   * @param lockedTime
   * @param retailerAddress
   * @param wallet
   */
  placeOrder = async (
    index: number,
    bidAmount: bigint,
    askAmount: bigint,
    lockedTime: bigint,
    retailerAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string, orderAddress: string }> => {
    if (!account.isAddress(retailerAddress))
      throw new Error('Invalid retailer address')

    if (bidAmount <= 0)
      throw new Error('Invalid bid amount')

    if (askAmount <= 0)
      throw new Error('Invalid ask amount')

    if (lockedTime <= 0)
      throw new Error('Invalid locked time')

    const ownerAddress = await wallet.getAddress()
    const ownerPublicKey = account.fromAddress(ownerAddress)

    const retailerPublicKey = account.fromAddress(retailerAddress)

    const orderAddress = await this.deriveOrderAddress(
      index,
      ownerAddress,
      retailerAddress,
    )
    const orderPublicKey = account.fromAddress(orderAddress)

    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'index', type: 'u32' },
        { key: 'bid_amount', type: 'u64' },
        { key: 'ask_amount', type: 'u64' },
        { key: 'locked_time', type: 'i64' },
      ],
      {
        code: InstructionCode.PlaceOrder.valueOf(),
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
        { pubkey: retailerPublicKey, isSigner: false, isWritable: true },

        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
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
    return { txId, orderAddress: orderAddress }
  }

  /**
   *
   * @param orderAddress
   * @param wallet
   */
  rejectOrder = async (
    orderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {

    if (!account.isAddress(orderAddress))
      throw new Error('Invalid order address')
    const orderPublicKey = account.fromAddress(orderAddress)

    const verifierAddress = await wallet.getAddress()
    const verifierPublicKey = account.fromAddress(verifierAddress)

    const {
      retailer: retailerAddress,
    } = await this.getOrderData(orderAddress)
    const retailerPublicKey = account.fromAddress(retailerAddress)

    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [{ key: 'code', type: 'u8' }],
      { code: InstructionCode.RejectOrder },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: verifierPublicKey, isSigner: true, isWritable: true },
        { pubkey: orderPublicKey, isSigner: false, isWritable: false },
        { pubkey: retailerPublicKey, isSigner: false, isWritable: false },
      ],
      programId: this.purchasingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = verifierPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   *
   * @param orderAddress
   * @param wallet
   */
  approveOrder = async (
    orderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(orderAddress))
      throw new Error('Invalid order address')
    const orderPublicKey = account.fromAddress(orderAddress)

    const verifierAddress = await wallet.getAddress()
    const verifierPublicKey = account.fromAddress(verifierAddress)

    const {
      owner: ownerAddress,
      retailer: retailerAddress,
    } = await this.getOrderData(orderAddress)
    const retailerPublicKey = account.fromAddress(retailerAddress)
    const ownerPublicKey = account.fromAddress(ownerAddress)

    const {
      mint_bid: mintBidAddress,
      treasury_bid: treasuryBidAddress,
    } = await this.getRetailerData(retailerAddress)
    const srcBidAddress = await this._splt.deriveAssociatedAddress(
      ownerAddress,
      mintBidAddress,
    )
    const srcBidPublicKey = account.fromAddress(srcBidAddress)

    const treasuryBidPublicKey = account.fromAddress(treasuryBidAddress)

    // transaction builder
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [{ key: 'code', type: 'u8' }],
      { code: InstructionCode.ApproveOrder },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: verifierPublicKey, isSigner: true, isWritable: true },
        { pubkey: ownerPublicKey, isSigner: false, isWritable: false },
        { pubkey: orderPublicKey, isSigner: false, isWritable: false },
        { pubkey: retailerPublicKey, isSigner: false, isWritable: false },
        { pubkey: srcBidPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryBidPublicKey, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.purchasingProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = verifierPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   *
   * @param orderAddress
   * @param wallet
   */
  cancelOrder = async (
    orderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(orderAddress))
      throw new Error('Invalid order address')
    const orderPublicKey = account.fromAddress(orderAddress)

    const ownerAddress = await wallet.getAddress()
    const ownerPublicKey = account.fromAddress(ownerAddress)

    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)

    const layout = new soproxABI.struct(
      [{ key: 'code', type: 'u8' }],
      { code: InstructionCode.CancelOrder },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: ownerPublicKey, isSigner: true, isWritable: true },
        { pubkey: orderPublicKey, isSigner: false, isWritable: false },
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

  /**
   *
   * @param orderAddress
   * @param wallet
   */
  redeemOrder = async (
    orderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(orderAddress))
      throw new Error('Invalid order address')
    const orderPublicKey = account.fromAddress(orderAddress)

    const {
      retailer: retailerAddress,
    } = await this.getOrderData(orderAddress)
    const retailerPublicKey = account.fromAddress(retailerAddress)

    const {
      mint_ask: mintAskAddress,
      treasury_ask: treasuryAskAddress,
    } = await this.getRetailerData(retailerAddress)
    const treasuryAskPublicKey = account.fromAddress(treasuryAskAddress)
    const mintAskPublicKey = account.fromAddress(mintAskAddress)

    const ownerAddress = await wallet.getAddress()
    const ownerPublicKey = account.fromAddress(ownerAddress)

    const dstAskAddress = await this._splt.deriveAssociatedAddress(
      ownerAddress,
      mintAskAddress,
    )
    const dstAskPublicKey = account.fromAddress(dstAskAddress)

    const [_, treasurerAskAddress] = await this.deriveRetailerTreasurerAddresses(retailerAddress)
    const treasurerAskPublicKey = account.fromAddress(treasuryAskAddress)

    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)

    const layout = new soproxABI.struct(
      [{ key: 'code', type: 'u8' }],
      { code: InstructionCode.RedeemOrder },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: ownerPublicKey, isSigner: true, isWritable: true },
        { pubkey: orderPublicKey, isSigner: false, isWritable: false },
        { pubkey: retailerPublicKey, isSigner: false, isWritable: false },
        { pubkey: mintAskPublicKey, isSigner: false, isWritable: false },
        { pubkey: dstAskPublicKey, isSigner: false, isWritable: false },
        { pubkey: treasuryAskPublicKey, isSigner: false, isWritable: false },
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