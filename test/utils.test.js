const { utils } = require('../dist')
const { payer } = require('./config')

describe('Utils library', function () {
  it('Should create a consistent emoji', async function () {
    const emoji = utils.randEmoji(payer.address)
    if (emoji != '🐑') throw new Error('Inconsistent emoji')
  })

  it('Should parse a coingecko ticket', async function () {
    const { name } = await utils.parseCGK('solana')
    if (name != 'Solana') throw new Error('Cannot fetch Coingecko data')
  })
})
