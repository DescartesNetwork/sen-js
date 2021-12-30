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

const OrderState = {
  OPEN: 1,
  APPROVED: 2,
  DONE: 3,
  REJECTED: 4,
  CANCELED: 5,
}

describe('Testing retailer', function () {
  it('initialize new retailer success', async function () {
    const purchasing = new Purchasing()
    const payerAddress = await wallet.getAddress()
    const { retailerAddress } = await purchasing.initializeRetailer(
      payerAddress,
      MINT_BID_ADDRESS,
      MINT_ASK_ADDRESS,
      wallet,
    )
    RETAILER_ADDRESS = retailerAddress
    console.log(`RETAILER_ADDRESS: ${RETAILER_ADDRESS}`)
  })

  describe('testing retailer functional', async function () {
    it('freeze retailer success', async function () {
      const purchasing = new Purchasing()
      await purchasing.freezeRetailer(RETAILER_ADDRESS, wallet)
      const retailer = await purchasing.getRetailerData(RETAILER_ADDRESS)
      assert.equal(retailer.state, RetailerState.FROZEN)
    })

    it('thaw retailer success', async function () {
      const purchasing = new Purchasing()
      await purchasing.thawRetailer(RETAILER_ADDRESS, wallet)
      const retailer = await purchasing.getRetailerData(RETAILER_ADDRESS)
      assert.equal(retailer.state, RetailerState.ACTIVE)
    })
  })

  describe('testing order functional', async function () {
    it('place an order success', async function () {
      const purchasing = new Purchasing()
      const { txId, orderAddress } = await purchasing.placeOrder(
        0,
        100n,
        20n,
        1n,
        RETAILER_ADDRESS,
        wallet,
      )
      ORDER_ADDRESS = orderAddress
      console.log(`ORDER_ADDRESS: ${ORDER_ADDRESS}`)
      const order = await purchasing.getOrderData(ORDER_ADDRESS)
      assert.equal(order.state, OrderState.OPEN)
    })

    it('approve an order success', async function () {
      const purchasing = new Purchasing()
      const { txId } = await purchasing.approveOrder(ORDER_ADDRESS, wallet)
      const order = await purchasing.getOrderData(ORDER_ADDRESS)
      assert.equal(order.state, OrderState.APPROVED)
    })

    it('redeem an order success', async function () {
      const purchasing = new Purchasing()
      const { txId } = await purchasing.redeemOrder(ORDER_ADDRESS, wallet)
      const order = await purchasing.getOrderData(ORDER_ADDRESS)
      assert.equal(order.state, OrderState.DONE)
    })

    it('cancel an order success', async function () {
      const purchasing = new Purchasing()
      const { orderAddress } = await purchasing.placeOrder(
        1,
        100n,
        20n,
        86400n,
        RETAILER_ADDRESS,
        wallet,
      )
      const { txId } = await purchasing.cancelOrder(orderAddress, wallet)
      const order = await purchasing.getOrderData(orderAddress)
      assert.equal(order.state, OrderState.CANCELED)
    })

    it('reject an order success', async function () {
      const purchasing = new Purchasing()
      const { orderAddress: orderAddress } = await purchasing.placeOrder(
        2,
        100n,
        20n,
        86400n,
        RETAILER_ADDRESS,
        wallet,
      )
      const { txId } = await purchasing.rejectOrder(orderAddress, wallet)
      const order = await purchasing.getOrderData(orderAddress)
      assert.equal(order.state, OrderState.REJECTED)
    })
  })
})
