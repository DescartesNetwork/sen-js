const { Swap } = require('../dist')

const { deposit, withdraw, swap, inverseSwap, rake, slippage } = Swap.oracle

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

describe('Oracle library', function () {
  describe('Rake', function () {
    it('Should rake', function (done) {
      const [a, b] = rake(deltaA, deltaB, reserveA, reserveB)
      if (a / b !== reserveA / reserveB) return done('Wrong rake')
      if (b / a !== reserveB / reserveA) return done('Wrong rake')
      return done()
    })
  })

  describe('Main', function () {
    it('Should swap', function (done) {
      const { askAmount } = swap(bidAmount, bidReserve, askReserve, FEE, TAX)
      if (askAmount !== 299100075901n) return done('Wrong market state')
      return done()
    })

    it('Should inverse swap', function (done) {
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
        return done('Wrong market state')
      return done()
    })

    it('Should compute slippage', function (done) {
      const slpg = slippage(bidAmount, bidReserve, askReserve, FEE, TAX)
      if (slpg !== 1997n) return done('Wrong slippage')
      return done()
    })

    it('Should deposit #1', function (done) {
      const { lpt, newReserveA, newReserveB } = deposit(
        deltaA,
        deltaB,
        0n,
        0n,
        0n,
      )
      if (lpt !== 2449489742n) return done('Wrong deposit')
      if (newReserveA !== deltaA) return done('Wrong deposit')
      if (newReserveB !== deltaB) return done('Wrong deposit')
      return done()
    })

    it('Should deposit #2', function (done) {
      const { lpt, newReserveA, newReserveB } = deposit(
        deltaA,
        deltaB,
        reserveA,
        reserveB,
        10n ** 9n,
      )
      if (lpt !== 400000n) return done('Wrong deposit')
      if (newReserveA !== 5002000000000n) return done('Wrong deposit')
      if (newReserveB !== 200080000000n) return done('Wrong deposit')
      return done()
    })

    it('Should withdraw #1', function (done) {
      const { deltaA, deltaB, newReserveA, newReserveB } = withdraw(
        10n,
        100n,
        reserveA,
        reserveB,
      )
      if (deltaA !== 500000000000n) return done('Wrong withdraw')
      if (deltaB !== 20000000000n) return done('Wrong withdraw')
      if (newReserveA !== 4500000000000n) return done('Wrong withdraw')
      if (newReserveB !== 180000000000n) return done('Wrong withdraw')
      return done()
    })

    it('Should withdraw #2', function (done) {
      const { deltaA, deltaB, newReserveA, newReserveB } = withdraw(
        100n,
        100n,
        reserveA,
        reserveB,
      )
      if (deltaA !== reserveA) return done('Wrong withdraw')
      if (deltaB !== reserveB) return done('Wrong withdraw')
      if (newReserveA !== 0n) return done('Wrong withdraw')
      if (newReserveB !== 0n) return done('Wrong withdraw')
      return done()
    })
  })
})
