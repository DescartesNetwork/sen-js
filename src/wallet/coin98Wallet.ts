import { Transaction, PublicKey } from '@solana/web3.js'
import { decode } from 'bs58'

import account from '../account'
import BaseWallet, { SignedMessage, Signature } from './baseWallet'

declare global {
  interface Window {
    coin98: any
  }
}

class Coin98Wallet extends BaseWallet {
  constructor() {
    super('Coin98')
  }

  getProvider = async () => {
    const { sol } = window?.coin98 || {}
    if (!sol) throw new Error('Wallet is not connected')
    return sol
  }

  getAddress = async () => {
    const provider = await this.getProvider()
    const [address] = (await provider.request({ method: 'sol_accounts' })) || []
    if (!account.isAddress(address))
      throw new Error('There is no Solana account')
    return address as string
  }

  rawSignTransaction = async (transaction: Transaction) => {
    const provider = await this.getProvider()
    const address = await this.getAddress()
    const publicKey = account.fromAddress(address) as PublicKey
    transaction.feePayer = publicKey
    const { signature: sig } = await provider.request({
      method: 'sol_sign',
      params: [transaction],
    })
    const signature = decode(sig)
    return { publicKey, signature } as Signature
  }

  signMessage = async (message: string) => {
    if (!message) throw new Error('Message must be a non-empty string')
    const provider = await this.getProvider()
    const data = await provider.request({
      method: 'sol_sign',
      params: [message],
    })
    return data as SignedMessage
  }

  verifySignature = async (
    signature: string,
    message: string,
    address?: string,
  ) => {
    address = address || (await this.getAddress())
    const valid = await account.verifySignature(address, signature, message)
    return valid as boolean
  }
}

export default Coin98Wallet
