import { Transaction, Keypair, PublicKey } from '@solana/web3.js'
import * as nacl from 'tweetnacl'

import account from './account'

type ExpanedProvider = Provider & { keypair: Keypair }

export interface Provider {
  disconnect: () => void
}

export type SignedMessage = {
  address: string // Base58 string
  signature: string // Hex string
  message: string // Utf8 string
}

/**
 * All the library in sen-js have been leveraged by wallet instance for getting wallet address, signing transaction for example.\
 *
 * @example
 *
 * The last parameter in the following example is `wallet` that respects `WalletInstance`.
 * By the `wallet`, the `transfer` method can sign or read necessary wallet info for the transaction.
 *
 * ```ts
 * splt.transfer(amount, srcAddress, dstAddress, wallet)
 * ```
 *
 * Following the interface, you can create a wallet instance that work with the libraries seamlessly.
 *
 * @remarks We have already written multiple wallet that you can refer as {@link https://github.com/DescartesNetwork/senhub/tree/master/src/os/view/header/wallet/lib | examples}
 */
export interface WalletInterface {
  /**
   * Any string that you can recognize your wallet type. For example: PrivateKey, Phantom, Sollet, ...
   */
  walletType: string

  /**
   * Wallet providers are varied from the original wallet (Coin98, Slope, ...).
   * Seems there is no single common standard, thus we only require `disconnect` method for the returned `provider`.
   * @return You can return anything from `getProvider` that respects to {@link https://descartesnetwork.github.io/sen-js/interfaces/Provider.html | Provider}
   */
  getProvider(): Promise<Provider>

  /**
   * Return wallet address
   * @returns Wallet address (base58)
   */
  getAddress(): Promise<string>

  /**
   * Sign the input transaction and return signed transaction
   * @param transaction - The transaction that needs to be signed
   * @returns The signed transaction
   */
  signTransaction(transaction: Transaction): Promise<Transaction>

  /**
   * Sign the input transactions and return signed transactions
   * @param transaction - The transaction that needs to be signed
   * @returns The signed transactions
   */
  signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>

  /**
   * Sign a message and return a signed messaged
   * @param message - String needs to be signed
   * @returns {@link https://descartesnetwork.github.io/sen-js/modules.html#SignedMessage | SignedMessage}
   */
  signMessage(message: string): Promise<SignedMessage>

  /**
   * Verify a singed message
   * @param signature - Signature (`signedMessage.signature`)
   * @param message - The original message (or `signedMessage.message`)
   * @param address - Optional. The address that signed the message. If not provided, the `address` will be fetched by `this.getAddress()`.
   */
  verifySignature(
    signature: string,
    message: string,
    address?: string,
  ): Promise<boolean>

  /**
   * Call the `disconnect` method from `provider` returned by `getProvider`
   */
  disconnect(): Promise<void>
}

/**
 * Raw wallet is for server side
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
    const { keypair } = await this.getProvider()
    const signData = transaction.serializeMessage()
    const publicKey = keypair.publicKey
    const signature = nacl.sign.detached(signData, keypair.secretKey)
    transaction.addSignature(publicKey, Buffer.from(signature))
    return transaction
  }

  signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    return Promise.all(
      transactions.map((transaction) => this.signTransaction(transaction)),
    )
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
