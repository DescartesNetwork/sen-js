import { PublicKey, TransactionInstruction } from '@solana/web3.js'
import Tx from '../core/tx'
import SPLT from '../splt'
import { InstructionCode, ErrorMapping } from '../purchasing/constant'
import account from '../account'
import {
  DEFAULT_PURCHASING_PROGRAM_ADDRESS, DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_STAKE_PROGRAM_ADDRESS,
} from '../default'
import { WalletInterface } from '../rawWallet'

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

    const { mint: mintBidAddress } = await this._splt.getAccountData(srcBidAddress)

    const { mint: mintAskAddress } = await this._splt.getAccountData(dstAskAddress)

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
        bid_amount: bid_amount,
        ask_amount: ask_amount,
        locked_time: locked_time,
      },
    )

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
      ],
      programId: this.purchasingProgramId,
      data: l,
    })
    return Promise.resolve({ txId: '', orderAddress: '' })
  }

  rejectPurchaseOrder = async (
    orderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string, orderAddress: string }> => {
    return Promise.resolve({ txId: '', orderAddress: '' })
  }

  approvePurchaseOrder = async (
    orderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string, orderAddress: string }> => {
    return Promise.resolve({ txId: '', orderAddress: '' })
  }

  cancelPurchaseOrder = async (
    orderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string, orderAddress: string }> => {
    return Promise.resolve({ txId: '', orderAddress: '' })
  }

  redeemPurchaseOrder = async (
    orderAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string, orderAddress: string }> => {
    return Promise.resolve({ txId: '', orderAddress: '' })
  }
}

export default Purchasing