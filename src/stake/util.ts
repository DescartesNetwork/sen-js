import { PublicKey, Keypair } from '@solana/web3.js'
import account from '../account'

export const uint32ToBuffer = (n: number): Buffer => {
  const buf = Buffer.allocUnsafe(4)
  buf.writeUInt32LE(n)
  return buf
}

export const genFarmAccount = async (
  programId: PublicKey,
): Promise<Keypair> => {
  if (!account.isAddress(programId.toBase58()))
    throw new Error('Invalid programId')
  while (true) {
    const acc = Keypair.generate()
    try {
      await PublicKey.createProgramAddress(
        [uint32ToBuffer(0), acc.publicKey.toBuffer()],
        programId,
      )
      await PublicKey.createProgramAddress(
        [uint32ToBuffer(1), acc.publicKey.toBuffer()],
        programId,
      )
      return acc
    } catch (er) {
      continue
    }
  }
}
