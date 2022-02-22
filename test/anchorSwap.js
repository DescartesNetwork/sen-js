const {
  account,
  Swap,
  RawWallet,
  Lamports,
  SPLT,
  DEFAULT_WSOL,
} = require('../dist')
const { payer, mints } = require('./config')
const assert = require('assert')

const anchor = require('@project-serum/anchor')

const wallet = new RawWallet(payer.secretKey)
// Fee & Tax
const FEE = new anchor.BN(2_500_000)
const TAX = new anchor.BN(500_000)
// Primary Mint
const { address: MINT_ADDRESS_0 } = mints[0]
// Mint 1
const { address: MINT_ADDRESS_1 } = mints[1]
// Mint 2
const { address: MINT_ADDRESS_2 } = mints[2]
// Pool 0
let POOL_ADDRESS_0 = ''
let LPT_ADDRESS_0 = ''
let MINT_LPT_ADDRESS_0 = ''
// Pool 1
let POOL_ADDRESS_1 = ''
let LPT_ADDRESS_1 = ''
let MINT_LPT_ADDRESS_1 = ''

describe('Swap library', function () {
  describe('Test pool initilization', function () {
    it('Test', async function () {
      const check = anchor.BN.(new anchor.BN(9))
      console.log('check', check)
    })
  })
})
