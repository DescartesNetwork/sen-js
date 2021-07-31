const { Lamports, utils, RawWallet } = require('../dist')
const { payer } = require('./config')

describe('Lamports library', function () {
  it('Should get lamports', async function () {
    const lamports = new Lamports()
    const balance = await lamports.getLamports(payer.address)
    if (typeof balance != 'number') throw new Error('Cannot get balance')
  })

  it('Should transfer lamports', async function () {
    const wallet = new RawWallet(payer.secretKey)
    const lamports = new Lamports()
    const sol = 0.005
    const txId = await lamports.transfer(
      utils.decimalize(sol, 9),
      payer.address,
      wallet,
    )
    if (typeof txId != 'string') throw new Error('Cannot send lamports')
  })
})
