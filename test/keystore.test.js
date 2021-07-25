const { keystore } = require('../dist')
const { payer } = require('./config')

describe('Keystore library', function () {
  it('Should decrypt a keystore', async function () {
    const secretKey = keystore.decrypt(payer.keystore, payer.password)
    if (secretKey != payer.secretKey)
      throw new Error('Invalid returned secret key')
  })

  it('Should encrypt a keystore', async function () {
    const ks = keystore.encrypt(payer.secretKey, payer.password)
    if (ks.publicKey != payer.address)
      throw new Error('Invalid returned keystore')
  })
})
