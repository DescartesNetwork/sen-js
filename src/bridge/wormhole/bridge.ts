import Tx from '../../core/tx'
import {
  Cluster,
  ClusterName,
  getETHTokenBridgeAddress,
  getSolBridgeAddress,
  getSolTokenBridgeAddress,
  getWormHoleRpcHosts,
} from './constant'
import { WalletInterface } from '../../rawWallet'
import {
  attestFromSolana, CHAIN_ID_SOLANA, createWrappedOnEth,
  getEmitterAddressSolana,
  getSignedVAA,
  parseSequenceFromLogSolana,
} from '@certusone/wormhole-sdk'
import account from '../../account'
import { PublicKey } from '@solana/web3.js'

const ErrorMapping: Array<string> = []

class Bridge extends Tx {

  private readonly cluster: Cluster = ClusterName.TestNet

  private readonly solBridgeAddress: string

  private readonly solTokenBridgeAddress: string

  private readonly wormHoleRpcHosts: Array<string>

  private readonly ethTokenBridgeAddress: string

  constructor(cluster: string) {
    super()
    // this.cluster = cluster
    this.solBridgeAddress = getSolBridgeAddress(this.cluster)
    this.solTokenBridgeAddress = getSolTokenBridgeAddress(this.cluster)
    this.wormHoleRpcHosts = getWormHoleRpcHosts(this.cluster)
    this.ethTokenBridgeAddress = getETHTokenBridgeAddress(this.cluster)
  }

  attest = async (
    //payerAddress: string,
    mintAddress: string,
    wallet: WalletInterface,
  ) => {
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)

    const transaction = await attestFromSolana(
      this.connection,
      this.solBridgeAddress,
      this.solTokenBridgeAddress,
      payerAddress,
      mintAddress,
    )
    const signed = await wallet.signTransaction(transaction)
    const txId = await this.connection.sendRawTransaction(signed.serialize())
    await this.connection.confirmTransaction(txId)

    // Get the sequence number and emitter address required to fetch the signedVAA of our message
    const info = await this.connection.getTransaction(txId)
    if (!info) return // TODO: return error
    const sequence = parseSequenceFromLogSolana(info)
    const emitterAddress = await getEmitterAddressSolana(this.solTokenBridgeAddress)

    // Fetch the signedVAA from the Wormhole Network (this may require retries while you wait for confirmation)
    // @ts-ignore
    const { signedVAA } = await getSignedVAA(
      this.wormHoleRpcHosts[0],
      CHAIN_ID_SOLANA,
      emitterAddress,
      sequence,
    )

    // @ts-ignore
    const { keypair } = await wallet.getProvider()

    // Create the wrapped token on Ethereum
    await createWrappedOnEth(
      this.ethTokenBridgeAddress,
      {
        publicKey: keypair.publicKey,
        secretKey: keypair.secretKey,
      },
      signedVAA
    )
  }
}


