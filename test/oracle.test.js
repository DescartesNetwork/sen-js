const { Swap } = require('../dist')

const {
  deposit,
  sided_deposit,
  withdraw,
  swap,
  inverseSwap,
  rake,
  extract,
  slippage,
} = Swap.oracle

const FEE = BigInt(2500000) // 0.25%
const TAX = BigInt(500000) // 0.05%

const bidAmount = 1000000000n
const bidReserve = 1000000000000000n
const askAmount = 1000000000000n
const askReserve = 300000000000000000n

const deltaA = 2000000000n
const deltaB = 3000000000n
const reserveA = 5000000000000n
const reserveB = 200000000000n
const liquidity = (5000000000000n * 200000000000n).sqrt()

describe('Oracle library', function () {
  describe('Extract & Rake', function () {
    it('Should extract', async function () {
      const [a, b] = extract(deltaA, deltaB, reserveA, reserveB)
      if (a / b !== reserveA / reserveB) throw new Error('Wrong extract')
      if (b / a !== reserveB / reserveA) throw new Error('Wrong extract')
    })

    it('Should rake', async function () {
      const bidAmount = rake(deltaA, reserveA, reserveB, FEE, TAX)
      const { askAmount, newReserveBid, newReserveAsk } = swap(
        bidAmount,
        reserveA,
        reserveB,
        FEE,
        TAX,
      )
      const c = Number(bidAmount) / Number(askAmount)
      const d = Number(newReserveBid) / Number(newReserveAsk)
      const differential = ((c - d) / c) * 100
      if (differential >= 1)
        throw new Error('Rake has a large (>1%) differential')
    })
  })

  describe('Main', function () {
    it('Should swap', function () {
      const { askAmount } = swap(bidAmount, bidReserve, askReserve, FEE, TAX)
      if (askAmount !== 299100075901n) throw new Error('Wrong market state')
    })

    it('Should inverse swap', function () {
      const bidAmount = inverseSwap(askAmount, bidReserve, askReserve, FEE, TAX)
      const { askAmount: lowerAskAmount } = swap(
        bidAmount,
        bidReserve,
        askReserve,
        FEE,
        TAX,
      )
      const { askAmount: upperAskAmount } = swap(
        bidAmount + 1n,
        bidReserve,
        askReserve,
        FEE,
        TAX,
      )
      if (lowerAskAmount > askAmount || askAmount > upperAskAmount)
        throw new Error('Wrong market state')
    })

    it('Should compute slippage', function () {
      const slpg = slippage(bidAmount, bidReserve, askReserve, FEE, TAX)
      if (slpg !== 1997n) throw new Error('Wrong slippage')
    })

    it('Should deposit #1', function () {
      const { lpt, newReserveA, newReserveB } = deposit(
        deltaA,
        deltaB,
        0n,
        0n,
        0n,
      )
      if (lpt !== 2449489742n) throw new Error('Wrong deposit')
      if (newReserveA !== deltaA) throw new Error('Wrong deposit')
      if (newReserveB !== deltaB) throw new Error('Wrong deposit')
    })

    it('Should deposit #2', function () {
      const { lpt, newReserveA, newReserveB, newLiquidity } = deposit(
        deltaA,
        deltaB,
        reserveA,
        reserveB,
        liquidity,
      )
      if (lpt !== 400000000n) throw new Error('Wrong deposit')
      if (newReserveA !== 5002000000000n) throw new Error('Wrong deposit')
      if (newReserveB !== 200080000000n) throw new Error('Wrong deposit')
      if (newLiquidity !== liquidity + lpt) throw new Error('Wrong deposit')
    })

    it('Should sided deposit #1', function () {
      const { lpt, newReserveA, newReserveB, newLiquidity } = sided_deposit(
        deltaA,
        deltaB,
        reserveA,
        reserveB,
        liquidity,
        FEE,
        TAX,
      )
      if (lpt !== 7662569938n) throw new Error('Wrong sided deposit')
      if (newReserveA !== 5001981965463n) throw new Error('Wrong sided deposit')
      if (newReserveB !== 203000000000n) throw new Error('Wrong sided deposit')
      if (newLiquidity !== liquidity + lpt)
        throw new Error('Wrong sided deposit')
    })

    it('Should withdraw #1', function () {
      const { deltaA, deltaB, newReserveA, newReserveB } = withdraw(
        10n,
        100n,
        reserveA,
        reserveB,
      )
      if (deltaA !== 500000000000n) throw new Error('Wrong withdraw')
      if (deltaB !== 20000000000n) throw new Error('Wrong withdraw')
      if (newReserveA !== 4500000000000n) throw new Error('Wrong withdraw')
      if (newReserveB !== 180000000000n) throw new Error('Wrong withdraw')
    })

    it('Should withdraw #2', function () {
      const { deltaA, deltaB, newReserveA, newReserveB } = withdraw(
        100n,
        100n,
        reserveA,
        reserveB,
      )
      if (deltaA !== reserveA) throw new Error('Wrong withdraw')
      if (deltaB !== reserveB) throw new Error('Wrong withdraw')
      if (newReserveA !== 0n) throw new Error('Wrong withdraw')
      if (newReserveB !== 0n) throw new Error('Wrong withdraw')
    })
  })
})
