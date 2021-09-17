import { Transaction, Keypair, PublicKey } from '@solana/web3.js'
import * as nacl from 'tweetnacl'

import account from './account'

type ExpanedProvider = Provider & { keypair: Keypair }

export interface Provider {
  disconnect: () => void
}

export type Signature = {
  publicKey: PublicKey
  signature: Buffer
}

export type SignedMessage = {
  address: string // Base58 string
  signature: string // Hex string
  message: string // Utf8 string
}

export interface WalletInterface {
  walletType: string
  getProvider(): Promise<Provider>
  getAddress(): Promise<string>
  signTransaction(transaction: Transaction): Promise<Transaction>
  rawSignTransaction(transaction: Transaction): Promise<Signature>
  signMessage(message: string): Promise<SignedMessage>
  verifySignature(
    signature: string,
    message: string,
    address?: string,
  ): Promise<boolean>
  disconnect(): Promise<void>
}

/**
 * Raw wallet is for server side
 * It removed storage and browser popup
 */
class RawWallet implements WalletInterface {
  walletType: string
  secretKey: string

  constructor(secretKey: string) {
    this.walletType = 'RawWallet'
    this.secretKey = secretKey
  }

  getProvider = async (): Promise<ExpanedProvider> => {
    const keypair = account.fromSecretKey(this.secretKey)
    if (!keypair) throw new Error('Cannot get the secretkey-based provider')
    const provider = {
      keypair,
      disconnect: () => {
        this.secretKey = ''
      },
    }
    return provider
  }

  getAddress = async () => {
    const { keypair } = await this.getProvider()
    return keypair.publicKey.toBase58()
  }

  signTransaction = async (transaction: Transaction): Promise<Transaction> => {
    const { signature, publicKey } = await this.rawSignTransaction(transaction)
    transaction.addSignature(publicKey, signature)
    return transaction
  }

  rawSignTransaction = async (transaction: Transaction) => {
    const { keypair } = await this.getProvider()
    const signData = transaction.serializeMessage()
    const publicKey = keypair.publicKey
    const signature = nacl.sign.detached(signData, keypair.secretKey)
    return { publicKey, signature } as Signature
  }

  signMessage = async (message: string) => {
    if (!message) throw new Error('Message must be a non-empty string')
    const { keypair } = await this.getProvider()
    const secretKey = Buffer.from(keypair.secretKey).toString('hex')
    const data = account.signMessage(message, secretKey)
    return { ...data }
  }

  verifySignature = async (
    signature: string,
    message: string,
    address?: string,
  ) => {
    address = address || (await this.getAddress())
    const valid = account.verifySignature(address, signature, message)
    return valid as boolean
  }

  disconnect = async () => {
    const provider = await this.getProvider()
    provider.disconnect()
  }
}

export default RawWallet
