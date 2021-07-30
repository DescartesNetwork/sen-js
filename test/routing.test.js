const { account, Routing, SPLT, Lamports, Swap, RawWallet } = require('../dist')
const { payer, mints } = require('./config')

const wallet = new RawWallet(payer.secretKey)
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
let VAULT_ADDRESS_0 = ''
// Pool 1
let POOL_ADDRESS_1 = ''
let LPT_ADDRESS_1 = ''
let MINT_LPT_ADDRESS_1 = ''
let VAULT_ADDRESS_1 = ''

describe('Routing library', function () {
  describe('Test pool initilization', function () {
    it('Should initialize pool 0', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )
      const { mintLPTAddress, vaultAddress, poolAddress, lptAddress } =
        await swap.initializePool(
          100000000000n,
          500000000000n,
          20000000000n,
          payerAddress,
          srcAddresses[0],
          srcAddresses[1],
          srcAddresses[2],
          wallet,
        )
      MINT_LPT_ADDRESS_0 = mintLPTAddress
      VAULT_ADDRESS_0 = vaultAddress
      POOL_ADDRESS_0 = poolAddress
      LPT_ADDRESS_0 = lptAddress
    })

    it('Should initialize pool 1', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )
      const { mintLPTAddress, vaultAddress, poolAddress, lptAddress } =
        await swap.initializePool(
          100000000000n,
          500000000000n,
          20000000000n,
          payerAddress,
          srcAddresses[0],
          srcAddresses[1],
          srcAddresses[2],
          wallet,
        )
      MINT_LPT_ADDRESS_1 = mintLPTAddress
      VAULT_ADDRESS_1 = vaultAddress
      POOL_ADDRESS_1 = poolAddress
      LPT_ADDRESS_1 = lptAddress
    })
  })

  describe('Test constructor', function () {
    it('Should fill configs', async function () {
      // Payer
      const payerAddress = await wallet.getAddress()
      console.log('PAYER:', payerAddress)
      console.log('\n')
      // Mint 0/1/2
      console.log('MINT_ADDRESS_0:', MINT_ADDRESS_0)
      console.log('MINT_ADDRESS_1:', MINT_ADDRESS_1)
      console.log('MINT_ADDRESS_2:', MINT_ADDRESS_2)
      console.log('\n')
      // Pool 0
      console.log('POOL_ADDRESS_0:', POOL_ADDRESS_0)
      console.log('LPT_ADDRESS_0:', LPT_ADDRESS_0)
      console.log('MINT_LPT_ADDRESS_0:', MINT_LPT_ADDRESS_0)
      console.log('VAULT_ADDRESS_0:', VAULT_ADDRESS_0)
      console.log('\n')
      // Pool 1
      console.log('POOL_ADDRESS_1:', POOL_ADDRESS_1)
      console.log('LPT_ADDRESS_1:', LPT_ADDRESS_1)
      console.log('MINT_LPT_ADDRESS_1:', MINT_LPT_ADDRESS_1)
      console.log('VAULT_ADDRESS_1:', VAULT_ADDRESS_1)
      console.log('\n')
    })

    it('Should be a valid default in constructor', function () {
      new Routing()
    })

    it('Should be a valid address in constructor', function () {
      new Routing('F5SvYWVLivzKc8XjoKaKxeXe2Yo8YZbJtbPbvq3b2sGj')
    })

    it('Should be an invalid address in constructor', function () {
      try {
        new Routing('abc')
        throw new Error('No error')
      } catch (er) {
        if (er.message === 'No error')
          throw new Error('An invalid address is skipped')
      }
    })
  })

  describe('Test swap', function () {
    it('Should normally swap', async function () {
      const routing = new Routing()
      await routing.swap(
        1000000000n,
        0n,
        POOL_ADDRESS_0,
        MINT_ADDRESS_1,
        MINT_ADDRESS_2,
        wallet,
      )
    })

    it('Should auto initilize account then swap', async function () {
      const lamports = new Lamports()
      const splt = new SPLT()
      const routing = new Routing()
      // Build needed account
      const keypair = account.createAccount()
      const payer = new RawWallet(
        Buffer.from(keypair.secretKey).toString('hex'),
      )
      const payerAddress = await payer.getAddress()
      await lamports.airdrop(1000000000n, payerAddress)
      const { accountAddress } = await splt.initializeAccount(
        MINT_ADDRESS_1,
        payerAddress,
        payer,
      )
      // Transfer budget
      const fundingAddress = await wallet.getAddress()
      const srcAddress = await account.deriveAssociatedAddress(
        fundingAddress,
        MINT_ADDRESS_1,
      )
      await splt.transfer(1000000000n, srcAddress, accountAddress, wallet)
      // Swap
      await routing.swap(
        1000000000n,
        0n,
        POOL_ADDRESS_0,
        MINT_ADDRESS_1,
        MINT_ADDRESS_2,
        payer,
      )
    })
  })

  describe('Test route', function () {
    it('Should normally route', async function () {
      const routing = new Routing()
      await routing.route(
        1000000000n,
        0n,
        POOL_ADDRESS_0,
        MINT_ADDRESS_1,
        0n,
        POOL_ADDRESS_1,
        MINT_ADDRESS_2,
        wallet,
      )
    })

    it('Should auto initilize account then route', async function () {
      const lamports = new Lamports()
      const splt = new SPLT()
      const routing = new Routing()
      // Build needed account
      const keypair = account.createAccount()
      const payer = new RawWallet(
        Buffer.from(keypair.secretKey).toString('hex'),
      )
      const payerAddress = await payer.getAddress()
      await lamports.airdrop(1000000000n, payerAddress)
      const { accountAddress } = await splt.initializeAccount(
        MINT_ADDRESS_1,
        payerAddress,
        payer,
      )
      // Transfer budget
      const fundingAddress = await wallet.getAddress()
      const srcAddress = await account.deriveAssociatedAddress(
        fundingAddress,
        MINT_ADDRESS_1,
      )
      await splt.transfer(1000000000n, srcAddress, accountAddress, wallet)
      // Swap
      await routing.route(
        1000000000n,
        0n,
        POOL_ADDRESS_0,
        MINT_ADDRESS_1,
        0n,
        POOL_ADDRESS_1,
        MINT_ADDRESS_2,
        payer,
      )
    })
  })
})
