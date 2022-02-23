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

const anchor = require('@project-serum/anchor')
const { BN } = require('@project-serum/anchor')

const FEE = new BN(2500000) // 0.25%
const TAX = new BN(500000) // 0.05%

const bidAmount = new BN(1000000000)
const bidReserve = new BN(1000000000000000)
const askAmount = new BN(1000000000000)
const askReserve = new BN('300000000000000000')

const deltaA = new BN(2000000000)
const deltaB = new BN(3000000000)
const reserveA = new BN(5000000000000)
const reserveB = new BN(200000000000)

function sqrtBN(self) {
  const one = new BN(1)
  const two = new BN(2)
  if (two.gt(self)) return self
  let bits = new BN(self.toString(2).length + 1).div(two)
  let start = one.shln(bits.sub(one).toNumber())
  let end = one.shln(bits.add(one).toNumber())
  while (end.gt(start)) {
    end = new BN(start.add(end)).div(two)
    start = new BN(self.div(end))
  }
  return end
}

const liquidity = sqrtBN(new BN(5000000000000).mul(new BN(200000000000)))

describe('Oracle library', function () {
  describe('Extract & Rake', function () {
    it('Should extract', async function () {
      const [a, b] = extract(deltaA, deltaB, reserveA, reserveB)
      if (!a.div(b).eq(reserveA.div(reserveB))) throw new Error('Wrong extract')
      if (!b.div(a).eq(reserveB.div(reserveA))) throw new Error('Wrong extract')
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
      if (!askAmount.eq(new BN(299100075901)))
        throw new Error('Wrong market state')
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
        bidAmount.add(new BN(1)),
        bidReserve,
        askReserve,
        FEE,
        TAX,
      )

      if (lowerAskAmount.gt(askAmount) || askAmount.gt(upperAskAmount))
        throw new Error('Wrong market state')
    })

    it('Should compute slippage', function () {
      const slpg = slippage(bidAmount, bidReserve, askReserve, FEE, TAX)
      if (!slpg.eqn(1997)) throw new Error('Wrong slippage')
    })

    it('Should deposit #1', function () {
      const { lpt, newReserveA, newReserveB } = deposit(
        deltaA,
        deltaB,
        new BN(0),
        new BN(0),
        new BN(0),
      )
      if (!lpt.eq(new BN(2449489742))) throw new Error('Wrong deposit lpt')
      if (!newReserveA.eq(deltaA)) throw new Error('Wrong deposit newReserveA')
      if (!newReserveB.eq(deltaB)) throw new Error('Wrong deposit newReserveB')
    })

    it('Should deposit #2', function () {
      const { lpt, newReserveA, newReserveB, newLiquidity } = deposit(
        deltaA,
        deltaB,
        reserveA,
        reserveB,
        liquidity,
      )
      if (!lpt.eq(new BN(400000000))) throw new Error('Wrong deposit 1')
      if (!newReserveA.eq(new BN(5002000000000)))
        throw new Error('Wrong deposit 2')
      if (!newReserveB.eq(new BN(200080000000)))
        throw new Error('Wrong deposit 3')
      if (!newLiquidity.eq(liquidity.add(lpt)))
        throw new Error('Wrong deposit 4')
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

      if (!lpt.eq(new BN(7662569938))) throw new Error('Wrong sided deposit 1')
      if (!newReserveA.eq(new BN(5001981965463)))
        throw new Error('Wrong sided deposit 2')
      if (!newReserveB.eq(new BN(203000000000)))
        throw new Error('Wrong sided deposit 3')
      if (!newLiquidity.eq(liquidity.add(lpt)))
        throw new Error('Wrong sided deposit 4')
    })

    it('Should withdraw #1', function () {
      const { deltaA, deltaB, newReserveA, newReserveB } = withdraw(
        new BN(10),
        new BN(100),
        reserveA,
        reserveB,
      )
      if (!deltaA.eq(new BN(500000000000))) throw new Error('Wrong withdraw')
      if (!deltaB.eq(new BN(20000000000))) throw new Error('Wrong withdraw')
      if (!newReserveA.eq(new BN(4500000000000)))
        throw new Error('Wrong withdraw')
      if (!newReserveB.eq(new BN(180000000000)))
        throw new Error('Wrong withdraw')
    })

    it('Should withdraw #2', function () {
      const { deltaA, deltaB, newReserveA, newReserveB } = withdraw(
        new BN(100),
        new BN(100),
        reserveA,
        reserveB,
      )
      if (!deltaA.eq(reserveA)) throw new Error('Wrong withdraw')
      if (!deltaB.eq(reserveB)) throw new Error('Wrong withdraw')
      if (!newReserveA.eq(new BN(0))) throw new Error('Wrong withdraw')
      if (!newReserveB.eq(new BN(0))) throw new Error('Wrong withdraw')
    })
  })
})
