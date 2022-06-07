const { utils } = require('../dist')
const { payer } = require('./config')

describe('Utils library', function () {
  it('Should parse a coingecko ticket', async function () {
    const { name } = await utils.parseCGK('solana')
    if (name != 'Solana') throw new Error('Cannot fetch Coingecko data')
  })
})
