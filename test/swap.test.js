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

const wallet = new RawWallet(payer.secretKey)
// Fee & Tax
const FEE = BigInt(2500000)
const TAX = BigInt(500000)
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
    it('Should initialize pool 0', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )
      const taxmanAddress = srcAddresses[0]
      const { mintLPTAddress, poolAddress, lptAddress } =
        await swap.initializePool(
          100000000000n,
          500000000000n,
          FEE,
          TAX,
          payerAddress,
          srcAddresses[0],
          srcAddresses[1],
          taxmanAddress,
          wallet,
        )
      MINT_LPT_ADDRESS_0 = mintLPTAddress
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
      const taxmanAddress = srcAddresses[0]
      const { mintLPTAddress, poolAddress, lptAddress } =
        await swap.initializePool(
          100000000000n,
          20000000000n,
          FEE,
          TAX,
          payerAddress,
          srcAddresses[0],
          srcAddresses[2],
          taxmanAddress,
          wallet,
        )
      MINT_LPT_ADDRESS_1 = mintLPTAddress
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
      console.log('\n')
      // Pool 1
      console.log('POOL_ADDRESS_1:', POOL_ADDRESS_1)
      console.log('LPT_ADDRESS_1:', LPT_ADDRESS_1)
      console.log('MINT_LPT_ADDRESS_1:', MINT_LPT_ADDRESS_1)
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
      const taxmanAddress = srcAddresses[0]
      try {
        await swap.initializePool(
          0n,
          50000000000n,
          FEE,
          TAX,
          payerAddress,
          srcAddresses[0],
          srcAddresses[1],
          taxmanAddress,
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
        srcAddresses[0],
        srcAddresses[1],
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
          POOL_ADDRESS_1,
          srcAddresses[0],
          srcAddresses[2],
          wallet,
        )
        throw new Error('No error')
      } catch (er) {
        if (er.message === 'No error') throw new Error('Swap bypass the limit')
      }
    })

    it('Should be successful routing', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )

      await swap.route(
        1000n,
        0n,
        [
          {
            poolAddress: POOL_ADDRESS_0,
            srcAddress: srcAddresses[1],
            dstAddress: srcAddresses[0],
          },
          {
            poolAddress: POOL_ADDRESS_1,
            srcAddress: srcAddresses[0],
            dstAddress: srcAddresses[2],
          },
        ],
        wallet,
      )
    })

    it('Should be failed routing because of treasury account not matched', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )

      try {
        await swap.route(
          1000n,
          0n,
          [
            {
              srcAddress: srcAddresses[0],
              dstAddress: srcAddresses[1],
              poolAddress: POOL_ADDRESS_0,
            },
            {
              srcAddress: srcAddresses[1],
              dstAddress: srcAddresses[2],
              poolAddress: POOL_ADDRESS_0,
            },
          ],
          wallet,
        )
      } catch (er) {
        assert.deepStrictEqual(
          er.message,
          'Cannot match mint addresses in pool',
        )
      }
    })

    it('Should be failed routing because of amount input is zero', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )

      try {
        const result = await swap.route(
          0n,
          20000000000n,
          [
            {
              srcAddress: srcAddresses[0],
              dstAddress: srcAddresses[2],
              poolAddress: POOL_ADDRESS_1,
            },
          ],
          wallet,
        )
      } catch (er) {
        assert.deepStrictEqual(er.message, 'Cannot input a zero amount')
      }
    })

    it('Should be failed routing because of exceed limit', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )

      try {
        const result = await swap.route(
          10n,
          20000000000n,
          [
            {
              srcAddress: srcAddresses[0],
              dstAddress: srcAddresses[2],
              poolAddress: POOL_ADDRESS_1,
            },
          ],
          wallet,
        )
        console.log(result)
      } catch (er) {
        assert.deepStrictEqual(er.message, 'Exceed limit')
      }
    })

    it('Should be wrapped', async function () {
      const swap = new Swap()
      const splt = new SPLT()
      const amount = 1000000n // 0.001
      const walletAddress = await wallet.getAddress()
      const wsolAddress = await splt.deriveAssociatedAddress(
        walletAddress,
        DEFAULT_WSOL,
      )
      await splt.closeAccount(wsolAddress, wallet)
      await swap.wrapSol(amount, wallet)
      const { amount: prevAmount } = await splt.getAccountData(wsolAddress)
      if (prevAmount !== amount) throw new Error('Incorrect wrapped amount')
      await swap.wrapSol(amount, wallet)
      const { amount: nextAmount } = await splt.getAccountData(wsolAddress)
      if (nextAmount !== 2n * amount)
        throw new Error('Incorrect wrapped amount')
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
        10000000000n,
        2000000000n,
        POOL_ADDRESS_1,
        srcAddresses[0],
        srcAddresses[2],
        wallet,
      )
      await swap.getLPTData(LPT_ADDRESS_0)
    })

    it('Should add sided liquidity', async function () {
      const swap = new Swap()
      const payerAddress = await wallet.getAddress()
      const srcAddresses = await Promise.all(
        mints.map(({ address: mintAddress }) =>
          account.deriveAssociatedAddress(payerAddress, mintAddress),
        ),
      )
      const { reserve_a: prevRA, reserve_b: prevRB } = await swap.getPoolData(
        POOL_ADDRESS_1,
      )
      // console.log(prevRA, prevRB)
      const { txId } = await swap.addSidedLiquidity(
        10000000000n,
        0n,
        POOL_ADDRESS_1,
        srcAddresses[0],
        srcAddresses[2],
        wallet,
      )
      const { reserve_a: nextRA, reserve_b: nextRB } = await swap.getPoolData(
        POOL_ADDRESS_1,
      )
      // console.log(nextRA, nextRB)
      const data = await swap.getLPTData(LPT_ADDRESS_0)
      // console.log(data)
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
      const { amount: prevAmount } = await swap.getLPTData(LPT_ADDRESS_1)
      await swap.removeLiquidity(
        amount,
        POOL_ADDRESS_1,
        srcAddresses[0],
        srcAddresses[2],
        wallet,
      )
      const { amount: currentAmount } = await swap.getLPTData(LPT_ADDRESS_1)
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
      const taxmanAddress = srcAddresses[0]
      const { poolAddress, lptAddress } = await swap.initializePool(
        10000000000n,
        5000000000n,
        FEE,
        TAX,
        payerAddress,
        srcAddresses[0],
        srcAddresses[1],
        taxmanAddress,
        wallet,
      )
      const { amount } = await swap.getLPTData(lptAddress)
      await swap.removeLiquidity(
        amount,
        poolAddress,
        srcAddresses[0],
        srcAddresses[1],
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

    it('Should update fee', async function () {
      const swap = new Swap()
      await swap.updateFee(2n * FEE, 0n, POOL_ADDRESS_0, wallet)
      const { fee_ratio, tax_ratio } = await swap.getPoolData(POOL_ADDRESS_0)
      if (fee_ratio != 2n * FEE) throw new Error('Cannot update fee')
      if (tax_ratio != 0n) throw new Error('Cannot update tax')
    })

    it('Should transfer taxman', async function () {
      const swap = new Swap()
      const lamports = new Lamports()
      const splt = new SPLT()
      const payer = new RawWallet(account.createAccount().secretKey)
      const payerAddress = await payer.getAddress()
      await lamports.airdrop(100000000n, payerAddress)
      const { accountAddress } = await splt.initializeAccount(
        MINT_ADDRESS_0,
        payerAddress,
        payer,
      )
      await swap.transferTaxman(POOL_ADDRESS_1, accountAddress, wallet)
      const { taxman } = await swap.getPoolData(POOL_ADDRESS_1)
      if (taxman != accountAddress) throw new Error('Cannot transfer taxman')
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
