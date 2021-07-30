import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js'

import Tx from './core/tx'
import account from './account'
import { WalletInterface } from './wallet/baseWallet'

class Lamports extends Tx {
  constructor(nodeUrl: string) {
    super(nodeUrl)
  }

  /**
   * Watch changes on a specific address
   * @param address
   * @param callback Callback of changes
   * @returns A watch id for the current watcher
   */
  watch = (
    address: string,
    callback: (error: string | null, lamports: number | null) => void,
  ): number | void => {
    if (!account.isAddress(address)) return callback('Invalid address', null)
    const publicKey = account.fromAddress(address) as PublicKey
    return this.connection.onAccountChange(publicKey, (data) => {
      if (!data) return callback('Cannot parse data', null)
      const { lamports } = data
      return callback(null, lamports)
    })
  }

  /**
   * Unwatch the current watcher
   * @param watchId Watch id
   * @returns
   */
  unwatch = async (watchId: number): Promise<void> => {
    if (!watchId) return
    return await this.connection.removeAccountChangeListener(watchId)
  }

  /**
   * Get the current lamports in balance
   * @param address
   * @returns
   */
  getLamports = async (address: string): Promise<number> => {
    if (!account.isAddress(address)) throw new Error('Invalid address')
    const publicKey = account.fromAddress(address) as PublicKey
    const lamports = await this.connection.getBalance(publicKey)
    return lamports
  }

  /**
   * Transfer lamports
   * @param lamports Number of lamports
   * @param dstAddress Destination address
   * @param wallet Payer wallet
   * @returns Transaction id
   */
  transfer = async (
    lamports: number | bigint,
    dstAddress: string,
    wallet: WalletInterface,
  ): Promise<string> => {
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    const dstPublicKey = account.fromAddress(dstAddress) as PublicKey
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    if (!payerPublicKey) throw new Error('Cannot get the payer address')
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const instruction = SystemProgram.transfer({
      fromPubkey: payerPublicKey,
      toPubkey: dstPublicKey,
      lamports: Number(lamports),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return txId
  }

  /**
   * (For devnet/testnet only) Airdrop SOL
   * @param lamports
   * @param dstAddress
   * @returns
   */
  airdrop = async (
    lamports: number | bigint,
    dstAddress: string,
  ): Promise<string> => {
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    const dstPublicKey = account.fromAddress(dstAddress) as PublicKey
    return await this.connection.requestAirdrop(dstPublicKey, Number(lamports))
  }
}

export default Lamports
