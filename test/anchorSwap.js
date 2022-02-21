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
          new anchor.BN(100000000000),
          new anchor.BN(500000000000),
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

    //   it('Should initialize pool 1', async function () {
    //     const swap = new Swap()
    //     const payerAddress = await wallet.getAddress()
    //     const srcAddresses = await Promise.all(
    //       mints.map(({ address: mintAddress }) =>
    //         account.deriveAssociatedAddress(payerAddress, mintAddress),
    //       ),
    //     )
    //     const taxmanAddress = srcAddresses[0]
    //     const { mintLPTAddress, poolAddress, lptAddress } =
    //       await swap.initializePool(
    //         new anchor.BN(100_000_000_000),
    //         new anchor.BN(500_000_000_000),
    //         FEE,
    //         TAX,
    //         payerAddress,
    //         srcAddresses[0],
    //         srcAddresses[2],
    //         taxmanAddress,
    //         wallet,
    //       )
    //     MINT_LPT_ADDRESS_1 = mintLPTAddress
    //     POOL_ADDRESS_1 = poolAddress
    //     LPT_ADDRESS_1 = lptAddress
    //   })
    // })

    // describe('Test constructor', function () {
    //   it('Should fill configs', async function () {
    //     // Payer
    //     const payerAddress = await wallet.getAddress()
    //     console.log('PAYER:', payerAddress)
    //     console.log('\n')
    //     // Mint 0/1/2
    //     console.log('MINT_ADDRESS_0:', MINT_ADDRESS_0)
    //     console.log('MINT_ADDRESS_1:', MINT_ADDRESS_1)
    //     console.log('MINT_ADDRESS_2:', MINT_ADDRESS_2)
    //     console.log('\n')
    //     // Pool 0
    //     console.log('POOL_ADDRESS_0:', POOL_ADDRESS_0)
    //     console.log('LPT_ADDRESS_0:', LPT_ADDRESS_0)
    //     console.log('MINT_LPT_ADDRESS_0:', MINT_LPT_ADDRESS_0)
    //     console.log('\n')
    //     // Pool 1
    //     console.log('POOL_ADDRESS_1:', POOL_ADDRESS_1)
    //     console.log('LPT_ADDRESS_1:', LPT_ADDRESS_1)
    //     console.log('MINT_LPT_ADDRESS_1:', MINT_LPT_ADDRESS_1)
    //     console.log('\n')
    //   })

    //   it('Should be a valid default in constructor', function () {
    //     new Swap()
    //   })

    //   it('Should be a valid address in constructor', function () {
    //     new Swap('F5SvYWVLivzKc8XjoKaKxeXe2Yo8YZbJtbPbvq3b2sGj')
    //   })

    //   it('Should be an invalid address in constructor', function () {
    //     try {
    //       new Swap('abc')
    //       throw new Error('No error')
    //     } catch (er) {
    //       if (er.message === 'No error')
    //         throw new Error('An invalid address is skipped')
    //     }
    //   })
    // })

    // describe('Test Pool', function () {
    //   it('Should be a valid pool data', async function () {
    //     const swap = new Swap()
    //     await swap.getPoolData(POOL_ADDRESS_0)
    //   })
    //   it('Should add sided liquidity', async function () {
    //     const swap = new Swap()
    //     const payerAddress = await wallet.getAddress()
    //     const srcAddresses = await Promise.all(
    //       mints.map(({ address: mintAddress }) =>
    //         account.deriveAssociatedAddress(payerAddress, mintAddress),
    //       ),
    //     )
    //     const { reserve_a: prevRA, reserve_b: prevRB } = await swap.getPoolData(
    //       POOL_ADDRESS_1,
    //     )
    //     // console.log(prevRA, prevRB)
    //     const { txId } = await swap.addSidedLiquidity(
    //       new anchor.BN(10000000000),
    //       new anchor.BN(0),
    //       POOL_ADDRESS_1,
    //       srcAddresses[0],
    //       srcAddresses[2],
    //       wallet,
    //     )
    //     const { reserve_a: nextRA, reserve_b: nextRB } = await swap.getPoolData(
    //       POOL_ADDRESS_1,
    //     )
    //     // console.log(nextRA, nextRB)
    //     console.log('LPT_ADDRESS_0', LPT_ADDRESS_0)
    //     const data = await swap.getLPTData(LPT_ADDRESS_0)
    //     // console.log(data)
    //   })
    //   it('Should remove liquidity', async function () {
    //     const swap = new Swap()
    //     const payerAddress = await wallet.getAddress()
    //     const srcAddresses = await Promise.all(
    //       mints.map(({ address: mintAddress }) =>
    //         account.deriveAssociatedAddress(payerAddress, mintAddress),
    //       ),
    //     )
    //     const amount = new anchor.BN(5000000000)
    //     console.log('LPT_ADDRESS_1', LPT_ADDRESS_1)
    //     const { amount: prevAmount } = await swap.getLPTData(LPT_ADDRESS_1)
    //     await swap.removeLiquidity(
    //       amount,
    //       POOL_ADDRESS_1,
    //       srcAddresses[0],
    //       srcAddresses[2],
    //       wallet,
    //     )
    //     const { amount: currentAmount } = await swap.getLPTData(LPT_ADDRESS_1)
    //     if (prevAmount - currentAmount != amount)
    //       throw new Error('Inconsistent amount')
    //   })

    //   it('Should be wrapped', async function () {
    //     const swap = new Swap()
    //     const splt = new SPLT()
    //     const amount = 1000000n // 0.001
    //     const walletAddress = await wallet.getAddress()
    //     const wsolAddress = await splt.deriveAssociatedAddress(
    //       walletAddress,
    //       DEFAULT_WSOL,
    //     )
    //     await splt.closeAccount(wsolAddress, wallet)
    //     await swap.wrapSol(amount, wallet)
    //     const { amount: prevAmount } = await splt.getAccountData(wsolAddress)
    //     if (prevAmount !== amount) throw new Error('Incorrect wrapped amount')
    //     await swap.wrapSol(amount, wallet)
    //     const { amount: nextAmount } = await splt.getAccountData(wsolAddress)
    //     if (nextAmount !== 2n * amount)
    //       throw new Error('Incorrect wrapped amount')
    //   })
  })
})
