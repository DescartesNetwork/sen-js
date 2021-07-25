const { PublicKey } = require('@solana/web3.js')
const { account, DEFAULT_SPLT_PROGRAM_ADDRESS } = require('../dist')

const PAYER_ADDRESS = '5vHjWRc2hys4XwZkMktg35N8oALt5d1ZXYkwCXXX3JHm'
const PAYER =
  'e06a1a17cf400f6c322e32377a9a7653eecf58f3eb0061023b743c689b43a5fa491573553e4afdcdcd1c94692a138dd2fd0dc0f6946ef798ba34ac1ad00b3720'
const MINT_ADDRESS = '6Qvp2kKkZwPoNibncFPygiEJJd6sFP5JeHbtsQDyBqNN'
const PWD_KEYSTORE = '123'
const KEYSTORE = {
  publicKey: '4hP7MofCGnMVxnbodrcn2yT69mVSTHhASLsdz3AmUtwK',
  Crypto: {
    ciphertext:
      'fc5867bf7ebe1a83fb64a9c6e53fdee5da82662197c58b68aaa80c7c444041b56832b2e636a29b9e5d0da5330e3dadfac2043bb2864d9151a5f183238f28c661',
    cipherparams: { counter: 789723 },
    kdfparams: {
      c: 8192,
      dklen: 32,
      prf: 'sha512',
      salt: '0f6fc4f250d00e5e2f1fe212d99b59f3c0faae1f1e80350123e2b456a10e3c8e',
    },
  },
}

describe('Account library', function () {
  it('Should be a valid address', async function () {
    const ok = account.isAddress(MINT_ADDRESS)
    if (!ok) throw new Error('Failed address validation')
  })

  it('Should create a strict account', async function () {
    const keypair = await account.createStrictAccount(
      account.fromAddress(DEFAULT_SPLT_PROGRAM_ADDRESS),
    )
    const seeds = [keypair.publicKey.toBuffer()]
    const derivedProgramAddress = await PublicKey.createProgramAddress(
      seeds,
      account.fromAddress(DEFAULT_SPLT_PROGRAM_ADDRESS),
    )
    const ok = account.isAddress(derivedProgramAddress)
    if (!ok) throw new Error('Derived programaddress is invalid')
  })

  it('Should create keypair from secret key', async function () {
    const acc = account.fromSecretKey(PAYER)
    if (PAYER_ADDRESS != acc.publicKey.toBase58())
      throw new Error('Invalid created ketpair')
  })

  it('Should create keypair from keystore', async function () {
    const acc = account.fromKeystore(KEYSTORE, PWD_KEYSTORE)
    if (KEYSTORE.publicKey != acc.publicKey.toBase58())
      throw new Error('Invalid created ketpair')
  })

  it('Should derive associated address', async function () {
    const payer = account.fromSecretKey(PAYER)
    const address = await account.deriveAssociatedAddress(
      payer.publicKey.toBase58(),
      MINT_ADDRESS,
    )
    const ok = account.isAssociatedAddress(address)
    if (!ok) throw new Error('Failed associated address validation')
  })

  it('Should signMessage/verifySiganture', async function () {
    const { address, signature, message } = account.signMessage('🚀', PAYER)
    const ok = account.verifySignature(address, signature, message)
    if (!ok) throw new Error('Incorrect signature')
  })
})
