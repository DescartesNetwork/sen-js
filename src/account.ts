import { Keypair, PublicKey } from '@solana/web3.js'
import { sign } from 'tweetnacl'
import {
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_SPLATA_PROGRAM_ADDRESS,
} from './default'
import ks, { KeyStore } from './keystore'

const account = {
  /**
   * Validate an address
   * @param address Base58 string
   * @returns true/false
   */
  isAddress: (address: string): boolean => {
    if (!address) return false
    try {
      const publicKey = new PublicKey(address)
      if (!publicKey) throw new Error('Invalid public key')
      return true
    } catch (er) {
      return false
    }
  },

  /**
   * Validate an associated address
   * @param address Base58 string
   * @returns true/false
   */
  isAssociatedAddress: (address: string): boolean => {
    if (!account.isAddress(address)) throw new Error('Invalid address')
    const publicKey = new PublicKey(address)
    return !PublicKey.isOnCurve(publicKey.toBuffer())
  },

  /**
   * Generate public key corresponding to the address
   * @param address Base58 string
   * @returns corresponding public key
   */
  fromAddress: (address: string): PublicKey | null => {
    if (!account.isAddress(address)) return null
    try {
      const publicKey = new PublicKey(address)
      return publicKey
    } catch (er) {
      return null
    }
  },

  /**
   * Try to find an keypair that can derive a program address with seed being itself
   * @param programId
   * @returns a randomly available keypair
   */
  createStrictAccount: async (programId: PublicKey): Promise<Keypair> => {
    if (!account.isAddress(programId.toBase58()))
      throw new Error('Invalid programId')
    while (true) {
      const acc = Keypair.generate()
      const seeds = [acc.publicKey.toBuffer()]
      try {
        await PublicKey.createProgramAddress(seeds, programId)
        return acc
      } catch (er) {
        continue
      }
    }
  },

  /**
   * Derive the associated address of a wallet and a mint
   * @param walletAddress
   * @param mintAddress
   * @param spltPromgramAddress
   * @param splataProgramAddress
   * @returns Base58 address
   */
  deriveAssociatedAddress: async (
    walletAddress: string,
    mintAddress: string,
    spltPromgramAddress: string = DEFAULT_SPLT_PROGRAM_ADDRESS,
    splataProgramAddress: string = DEFAULT_SPLATA_PROGRAM_ADDRESS,
  ): Promise<string> => {
    const walletPublicKey = account.fromAddress(walletAddress)
    const mintPublicKey = account.fromAddress(mintAddress)
    const spltPublicKey = account.fromAddress(spltPromgramAddress)
    const splataPublicKey = account.fromAddress(splataProgramAddress)
    if (!walletPublicKey) throw new Error('Invalid wallet address')
    if (!mintPublicKey) throw new Error('Invalid mint address')
    if (!spltPublicKey) throw new Error('Invalid SPL token address')
    if (!splataPublicKey)
      throw new Error('Invalid SPL associated token account address')
    const [publicKey] = await PublicKey.findProgramAddress(
      [
        walletPublicKey.toBuffer(),
        spltPublicKey.toBuffer(),
        mintPublicKey.toBuffer(),
      ],
      splataPublicKey,
    )
    return publicKey.toBase58()
  },

  /**
   * Generate account by secret key
   * @param secretKey
   * @returns Keypair
   */
  fromSecretKey: (secretKey: string): Keypair | null => {
    if (!secretKey) return null
    try {
      return Keypair.fromSecretKey(Buffer.from(secretKey, 'hex'))
    } catch (er) {
      return null
    }
  },

  /**
   * Generate account by keystore
   * @param keystore
   * @param password
   * @returns
   */
  fromKeystore: (keystore: KeyStore, password: string): Keypair | null => {
    if (!keystore || !password) return null
    const secretKey = ks.decrypt(keystore, password)
    if (!secretKey) return null
    return account.fromSecretKey(secretKey)
  },

  /**
   * Sign a message by a secret key
   * @param message
   * @param secretKey
   * @returns
   */
  signMessage: (message: string, secretKey: string) => {
    const keyPair = account.fromSecretKey(secretKey)
    if (!keyPair) throw new Error('Invalid secret key')
    const address = keyPair.publicKey.toBase58()
    const bufSecretKey = keyPair.secretKey
    const serializedData = Buffer.from(message)
    const bufSig = sign(serializedData, bufSecretKey)
    const signature = Buffer.from(bufSig).toString('hex')
    return { address, signature, message }
  },

  /**
   * Verify a signature by provided address and message
   * If message is null, the return is the message
   * Else the return is true/false
   * @param address
   * @param signature
   * @param message
   * @returns string/boolean
   */
  verifySignature: (
    address: string,
    signature: string,
    message: string | null = null,
  ): string | boolean => {
    if (!account.isAddress(address)) throw new Error('Invalid address')
    if (typeof signature !== 'string')
      throw new Error('Signature must be a hex string')
    const publicKey = (account.fromAddress(address) as PublicKey).toBuffer()
    const bufSig = Buffer.from(signature, 'hex')
    const bufMsg = sign.open(bufSig, publicKey)
    if (!bufMsg) throw new Error('Invalid signature or public key')
    const msg = Buffer.from(bufMsg).toString('utf8')
    if (!msg) return false
    if (!message) return msg
    if (message && message === msg) return true
    return false
  },
}

export default account
