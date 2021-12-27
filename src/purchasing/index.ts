import { PublicKey } from '@solana/web3.js'
import Tx from '../core/tx'
import SPLT from '../splt'
import { ErrorMapping } from '../purchasing/constant'
import account from '../account'
import {
  DEFAULT_PURCHASING_PROGRAM_ADDRESS, DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_STAKE_PROGRAM_ADDRESS,
} from '../default'

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

  placePurchaseOrder = async (): Promise<{ txId: string, orderAddress: string }> => {
    return Promise.resolve({ txId: '', orderAddress: '' })
  }

  rejectPurchaseOrder = async (): Promise<{ txId: string, orderAddress: string }> => {
    return Promise.resolve({ txId: '', orderAddress: '' })
  }

  approvePurchaseOrder = async (): Promise<{ txId: string, orderAddress: string }> => {
    return Promise.resolve({ txId: '', orderAddress: '' })
  }

  cancelPurchaseOrder = async (): Promise<{ txId: string, orderAddress: string }> => {
    return Promise.resolve({ txId: '', orderAddress: '' })
  }

  redeemPurchaseOrder = async (): Promise<{ txId: string, orderAddress: string }> => {
    return Promise.resolve({ txId: '', orderAddress: '' })
  }
}

export default Purchasing