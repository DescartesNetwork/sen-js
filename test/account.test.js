const { account } = require('../dist')

const PAYER =
  'e06a1a17cf400f6c322e32377a9a7653eecf58f3eb0061023b743c689b43a5fa491573553e4afdcdcd1c94692a138dd2fd0dc0f6946ef798ba34ac1ad00b3720'
const MINT_ADDRESS = '6Qvp2kKkZwPoNibncFPygiEJJd6sFP5JeHbtsQDyBqNN'

describe('Account library', function () {
  it('Should be a valid address', async function () {
    const ok = account.isAddress(MINT_ADDRESS)
    if (!ok) throw new Error('Failed address validation')
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
