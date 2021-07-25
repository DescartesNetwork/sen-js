import { randomBytes } from 'tweetnacl'
import { Keypair } from '@solana/web3.js'
import { pbkdf2Sync } from 'pbkdf2'
import * as aesjs from 'aes-js'

export interface KeyStore {
  publicKey: string
  Crypto: {
    ciphertext: string
    cipherparams: {
      counter: number
    }
    kdfparams: {
      c: number
      dklen: number
      prf: string
      salt: string
    }
  }
}

const hollowKeystore = (): KeyStore => {
  return {
    publicKey: '',
    Crypto: {
      ciphertext: '',
      cipherparams: { counter: Math.floor(100000 + Math.random() * 900000) },
      kdfparams: {
        c: 8192,
        dklen: 32,
        prf: 'sha512',
        salt: Buffer.from(randomBytes(32)).toString('hex'),
      },
    },
  }
}

const keystore = {
  decrypt: (ks: KeyStore, pwd: string) => {
    if (!ks || !pwd) return null
    try {
      const {
        publicKey,
        Crypto: {
          ciphertext,
          cipherparams: { counter },
          kdfparams: { c, dklen, prf, salt },
        },
      } = ks
      const key = pbkdf2Sync(pwd, salt, c, dklen, prf)
      const aesCtr = new aesjs.ModeOfOperation.ctr(
        key,
        new aesjs.Counter(counter),
      )
      const secretKey = aesCtr.decrypt(aesjs.utils.hex.toBytes(ciphertext))
      const account = Keypair.fromSecretKey(secretKey)
      if (account.publicKey.toBase58() !== publicKey) return null
      return Buffer.from(account.secretKey).toString('hex')
    } catch (er) {
      return null
    }
  },

  encrypt: (secretKey: string, pwd: string) => {
    if (!secretKey || !pwd) return null
    try {
      let ks = hollowKeystore()
      const {
        Crypto: {
          cipherparams: { counter },
          kdfparams: { c, dklen, prf, salt },
        },
      } = ks
      const account = Keypair.fromSecretKey(Buffer.from(secretKey, 'hex'))
      const key = pbkdf2Sync(pwd, salt, c, dklen, prf)
      const aesCtr = new aesjs.ModeOfOperation.ctr(
        key,
        new aesjs.Counter(counter),
      )
      const cipherbuf = aesCtr.encrypt(account.secretKey)
      const ciphertext = aesjs.utils.hex.fromBytes(cipherbuf)
      ks.publicKey = account.publicKey.toBase58()
      ks.Crypto.ciphertext = ciphertext
      return ks
    } catch (er) {
      return null
    }
  },

  gen: (pwd: string) => {
    if (!pwd) return null
    const account = Keypair.generate()
    const secretKey = Buffer.from(account.secretKey).toString('hex')
    return keystore.encrypt(secretKey, pwd)
  },
}

export default keystore
