const { PublicKey } = require('@solana/web3.js')

const { account, Swap, SPLT, RawWallet } = require('../dist')
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

describe('Swap library', function () {
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
      new Swap()
    })

    it('Should be a valid address in constructor', function () {
      new Swap('F5SvYWVLivzKc8XjoKaKxeXe2Yo8YZbJtbPbvq3b2sGj')
    })

    it('Should be an invalid address in constructor', function () {
      try {
        new Swap('abc')
        throw new Error('No error')
      } catch (er) {
        if (er.message === 'No error')
          throw new Error('An invalid address is skipped')
      }
    })
  })

  describe('Test Pool', function () {
    it('Should be a valid pool data', async function () {
      const swap = new Swap()
      await swap.getPoolData(POOL_ADDRESS_0)
    })

    it('Should not initialize pool', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )
      try {
        await swap.initializePool(
          0n,
          50000000000n,
          50000000000n,
          payerAddress,
          srcAddresses[0],
          srcAddresses[1],
          srcAddresses[2],
          wallet,
        )
        throw new Error('No error')
      } catch (er) {
        if (er.message == 'No error')
          throw new Error('The reserve should be not zero')
      }
    })

    it('Should be a successful swap', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )
      await swap.swap(
        1000000000n,
        0n,
        POOL_ADDRESS_0,
        srcAddresses[1],
        srcAddresses[2],
        wallet,
      )
    })

    it('Should be a failed swap (exceed limit)', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )
      try {
        await swap.swap(
          1000000000n,
          1000000000n,
          POOL_ADDRESS_0,
          srcAddresses[1],
          srcAddresses[2],
          wallet,
        )
        throw new Error('No error')
      } catch (er) {
        if (er.message === 'No error') throw new Error('Swap bypass the limit')
      }
    })
  })

  describe('Test LPT', function () {
    it('Should be a valid lpt data', async function () {
      const swap = new Swap()
      await swap.getLPTData(LPT_ADDRESS_0)
    })

    it('Should add liquidity', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )
      await swap.addLiquidity(
        100000000000n,
        100000000000n,
        100000000000n,
        POOL_ADDRESS_0,
        srcAddresses[0],
        srcAddresses[1],
        srcAddresses[2],
        wallet,
      )
      await swap.getLPTData(LPT_ADDRESS_0)
    })

    it('Should remove liquidity', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )
      const amount = 5000000000n
      const { amount: prevAmount } = await swap.getLPTData(LPT_ADDRESS_0)
      await swap.removeLiquidity(
        amount,
        POOL_ADDRESS_0,
        srcAddresses[0],
        srcAddresses[1],
        srcAddresses[2],
        wallet,
      )
      const { amount: currentAmount } = await swap.getLPTData(LPT_ADDRESS_0)
      if (prevAmount - currentAmount != amount)
        throw new Error('Inconsistent amount')
    })

    it('Should close LPT Account', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )
      const { poolAddress, lptAddress } = await swap.initializePool(
        10000000000n,
        5000000000n,
        5000000000n,
        payerAddress,
        srcAddresses[0],
        srcAddresses[1],
        srcAddresses[2],
        wallet,
      )
      await swap.removeLiquidity(
        10000000000n,
        poolAddress,
        srcAddresses[0],
        srcAddresses[1],
        srcAddresses[2],
        wallet,
      )
      await swap.closeLPT(lptAddress, wallet)
    })
  })

  describe('Test pool owner', function () {
    it('Should freeze/thaw pool', async function () {
      const swap = new Swap()
      await swap.freezePool(POOL_ADDRESS_0, wallet)
      await swap.thawPool(POOL_ADDRESS_0, wallet)
      await swap.getPoolData(POOL_ADDRESS_0)
    })

    it('Should earn', async function () {
      const swap = new Swap()
      const amount = 1000n
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )
      await swap.earn(amount, POOL_ADDRESS_0, srcAddresses[0], wallet)
    })

    it('Should transfer pool ownership', async function () {
      const swap = new Swap()
      const newOwnerAddress = account.createAccount().publicKey.toBase58()
      await swap.transferPoolOwnership(POOL_ADDRESS_1, newOwnerAddress, wallet)
      const { owner } = await swap.getPoolData(POOL_ADDRESS_1)
      if (owner != newOwnerAddress)
        throw new Error('Cannot transfer pool ownership')
    })
  })
})
