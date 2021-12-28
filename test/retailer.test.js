const { Purchasing, RawWallet } = require('../dist')
const { payer, mints } = require('./config')

const wallet = new RawWallet(payer.secretKey)

const { address: MINT_BID_ADDRESS } = mints[0]
const { address: MINT_ASK_ADDRESS } = mints[1]

let RETAILER_ADDRESS = ''

describe('Testing retailer', function() {
  it('initialize new retailer success', async function() {
    const purchasing = new Purchasing()
    const payerAddress = await wallet.getAddress()
    const { retailerAddress } = await purchasing.initializeRetailer(
      payerAddress,
      MINT_BID_ADDRESS,
      MINT_ASK_ADDRESS,
      wallet,
    )
    RETAILER_ADDRESS = retailerAddress
  })
})