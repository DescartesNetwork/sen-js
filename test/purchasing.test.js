const { Purchasing, RawWallet } = require('../dist')
const { payer, mints } = require('./config')
const assert = require('assert')

const wallet = new RawWallet(payer.secretKey)

const { address: MINT_BID_ADDRESS } = mints[0]
const { address: MINT_ASK_ADDRESS } = mints[1]

let RETAILER_ADDRESS = ''
let ORDER_ADDRESS = ''

const RetailerState = {
  ACTIVE: 1,
  FROZEN: 2,
}

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

  describe('testing retailer functional', async function() {
    it('freeze retailer success', async function() {
      const purchasing = new Purchasing()
      await purchasing.freezeRetailer(RETAILER_ADDRESS, wallet)
      const retailer = await purchasing.getRetailerData(RETAILER_ADDRESS)
      assert.equal(retailer.state, RetailerState.FROZEN)
    })

    it('thaw retailer success', async function() {
      const purchasing = new Purchasing()
      await purchasing.thawRetailer(RETAILER_ADDRESS, wallet)
      const retailer = await purchasing.getRetailerData(RETAILER_ADDRESS)
      assert.equal(retailer.state, RetailerState.ACTIVE)
    })
  })

  describe('testing order functional', async function() {
    it('place an order success', async function() {
      const purchasing = new Purchasing()
      const {
        txId: txId,
        orderAddress: orderAddress,
      } = await purchasing.placeOrder(
        0,
        100n,
        20n,
        86400n,
        RETAILER_ADDRESS,
        wallet,
      )
      ORDER_ADDRESS = orderAddress
      console.log(ORDER_ADDRESS)
      console.log(txId)
    })
  })
})