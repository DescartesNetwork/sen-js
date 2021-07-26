import {
  Connection,
  Transaction,
  SystemProgram,
  Keypair,
  PublicKey,
} from '@solana/web3.js'
import * as nacl from 'tweetnacl'

import account from '../account'
import { DEFAULT_NODEURL } from '../default'
import { Signature, WalletInterface } from '../wallet/baseWallet'

class Tx {
  nodeUrl: string
  connection: Connection

  constructor(nodeUrl = DEFAULT_NODEURL) {
    this.nodeUrl = nodeUrl
    this.connection = new Connection(this.nodeUrl, 'confirmed')
  }

  /**
   * Broadcast a transaction to clusters and return the txId when it's confirmed
   * @param transaction Signed transaction
   * @returns transaction id
   */
  protected sendTransaction = async (
    transaction: Transaction,
  ): Promise<string> => {
    const tx = transaction.serialize()
    const txId = await this.connection.sendRawTransaction(tx, {
      skipPreflight: true,
      preflightCommitment: 'confirmed',
    })
    const {
      value: { err },
    } = await this.connection.confirmTransaction(txId, 'confirmed')
    if (err) throw new Error(err.toString())
    return txId
  }

  /**
   * Add transaction commitment
   * @param transaction
   * @returns transaction with added commitment
   */
  protected addRecentCommitment = async (
    transaction: Transaction,
  ): Promise<Transaction> => {
    const { blockhash } = await this.connection.getRecentBlockhash('confirmed')
    transaction.recentBlockhash = blockhash
    return transaction
  }

  /**
   * Add transaction signature
   * @param transaction
   * @param { publicKey, signature } signature
   * @returns transaction with added signature
   */
  protected addSignature = (
    transaction: Transaction,
    { publicKey, signature }: Signature,
  ): Transaction => {
    if (!transaction.feePayer) transaction.feePayer = publicKey
    transaction.addSignature(publicKey, signature)
    return transaction
  }

  /**
   * Sign a transaction by a keypair
   * @param transaction
   * @param account
   * @returns signature
   */
  protected selfSign = (
    transaction: Transaction,
    account: Keypair,
  ): Signature => {
    if (!transaction || !transaction.feePayer)
      throw new Error('Empty transaction')
    if (!transaction.feePayer) throw new Error('Empty transaction payer')
    if (!account || !account.secretKey) throw new Error('Empty account')
    const publicKey = account.publicKey
    const signData = transaction.serializeMessage()
    const sig = nacl.sign.detached(signData, account.secretKey)
    const signature = Buffer.from(sig)
    return { publicKey, signature }
  }

  /**
   * isReadyForRent
   * @param {*} newAccount The account need to be rented
   * @param {*} space The bytes length will be rented
   * @param {*} programId The owner program
   * @returns bool
   *   true - not rented
   *   false - rented but not initialized
   */
  private isReadyForRent = async (
    newAccount: Keypair,
    space: number,
    programId: PublicKey,
  ): Promise<boolean> => {
    const data = await this.connection.getAccountInfo(newAccount.publicKey)
    if (!data) return true
    if (data.owner.equals(SystemProgram.programId)) return true
    if (!data.owner.equals(programId)) throw new Error('Invalid program id')
    if (data.data.length !== space) throw new Error('Invalid data length')
    if (!data.data.every((e) => !e)) throw new Error('Account was initilized')
    return false
  }

  /**
   * Rent an account
   * @param wallet Payer wallet
   * @param newAccount The account needs to be rented
   * @param space The bytes length need to be rented
   * @param programId Owner program
   * @returns transaction id, it will be null if the account is rented before
   */
  protected rentAccount = async (
    wallet: WalletInterface,
    newAccount: Keypair,
    space: number,
    programId: PublicKey,
  ): Promise<string | null> => {
    // Get payer
    const payerAddress = await wallet.getAddress()
    const fromPubkey = account.fromAddress(payerAddress)
    if (!fromPubkey) throw new Error('Cannot get the payer address')
    // Validate account
    const notRented = await this.isReadyForRent(newAccount, space, programId)
    if (!notRented) return null
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const lamports = await this.connection.getMinimumBalanceForRentExemption(
      space,
    )
    const instruction = SystemProgram.createAccount({
      fromPubkey,
      newAccountPubkey: newAccount.publicKey,
      lamports,
      space,
      programId,
    })
    transaction.add(instruction)
    transaction.feePayer = fromPubkey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    const accSig = this.selfSign(transaction, newAccount)
    this.addSignature(transaction, accSig)
    // Send tx
    const txId = this.sendTransaction(transaction)
    return txId
  }
}

export default Tx
