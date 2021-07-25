const { PublicKey } = require('@solana/web3.js')
const { account, DEFAULT_SPLT_PROGRAM_ADDRESS } = require('../dist')
const { payer, mint } = require('./config')

describe('Account library', function () {
  it('Should be a valid address', async function () {
    const ok = account.isAddress(mint.address)
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
    const acc = account.fromSecretKey(payer.secretKey)
    if (payer.address != acc.publicKey.toBase58())
      throw new Error('Invalid created ketpair')
  })

  it('Should create keypair from keystore', async function () {
    const acc = account.fromKeystore(payer.keystore, payer.password)
    if (payer.address != acc.publicKey.toBase58())
      throw new Error('Invalid created ketpair')
  })

  it('Should derive associated address', async function () {
    const acc = account.fromSecretKey(payer.secretKey)
    const address = await account.deriveAssociatedAddress(
      acc.publicKey.toBase58(),
      mint.address,
    )
    const ok = account.isAssociatedAddress(address)
    if (!ok) throw new Error('Failed associated address validation')
  })

  it('Should signMessage/verifySiganture', async function () {
    const { address, signature, message } = account.signMessage(
      '🚀',
      payer.secretKey,
    )
    const ok = account.verifySignature(address, signature, message)
    if (!ok) throw new Error('Incorrect signature')
  })
})
