import { Provider } from '@project-serum/anchor'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { WalletInterface } from '../../rawWallet'

export const getAnchorProvider = async (
  connection: Connection,
  wallet?: WalletInterface,
): Promise<Provider> => {
  if (wallet) {
    const signAllTransactions = async (transactions: Transaction[]) => {
      const signedTransactions = []
      for (const transaction of transactions) {
        const signedTransaction = await wallet.signTransaction(transaction)
        signedTransactions.push(signedTransaction)
      }
      return signedTransactions
    }

    const publicKey = await wallet.getAddress()
    return new Provider(
      connection,
      {
        publicKey: new PublicKey(publicKey),
        signTransaction: wallet.signTransaction,
        signAllTransactions,
      },
      {
        skipPreflight: true,
        commitment: 'confirmed',
      },
    )
  }
  return new Provider(
    connection,
    {
      publicKey: '' as any,
      signTransaction: (): any => {},
      signAllTransactions: (): any => {},
    },
    {},
  )
}

export const getRawAnchorProvider = (connection: Connection): Provider => {
  return new Provider(
    connection,
    {
      publicKey: '' as any,
      signTransaction: (): any => {},
      signAllTransactions: (): any => {},
    },
    {},
  )
}
