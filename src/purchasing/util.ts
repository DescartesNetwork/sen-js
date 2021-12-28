import { PublicKey, Keypair } from '@solana/web3.js'
import account from '../account'

export const uint32ToBuffer = (n: number): Buffer => {
  const buf = Buffer.allocUnsafe(4)
  buf.writeUInt32LE(n)
  return buf
}