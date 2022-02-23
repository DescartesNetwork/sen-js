import { BN } from '@project-serum/anchor'

function sqrtBN(self: BN) {
  const one = new BN(1)
  const two = new BN(2)
  if (self < two) return self
  let bits = new BN(self.toString(2).length + 1).div(two)
  let start = one.shln(bits.sub(one).toNumber())
  let end = one.shln(bits.add(one).toNumber())
  while (start < end) {
    end = new BN(start.add(end)).div(two)
    start = new BN(self.div(end))
  }
  return end
}

const PRECISION = new BN(1000_000_000) // 10^9

const oracle = {
  extract: (a: BN, b: BN, reserveA: BN, reserveB: BN) => {
    if (reserveA.isZero() || reserveB.isZero())
      throw new Error('Invalid deposit/reserves')
    if (a.isZero() || b.isZero()) return [new BN(0), new BN(0)]
    const l = a.mul(reserveB)
    const r = b.mul(reserveA)
    if (l > r) return [r.div(reserveB), b]
    if (l < r) return [a, l.div(reserveA)]
    return [a, b]
  },

  rake: (
    amount: BN,
    bidReserve: BN,
    askReserve: BN,
    feeRatio: BN,
    taxRatio: BN,
  ) => {
    let delta = amount
    let bidAmount = amount.divn(2)
    while (true) {
      const { askAmount, newReserveBid, newReserveAsk } = oracle.swap(
        bidAmount,
        bidReserve,
        askReserve,
        feeRatio,
        taxRatio,
      )
      const remainer = amount.sub(bidAmount)
      const expectedRemainer = askAmount.mul(newReserveBid).div(newReserveAsk)
      const nextDelta =
        remainer > expectedRemainer
          ? remainer.sub(expectedRemainer).divn(2)
          : expectedRemainer.sub(remainer).divn(2)
      if (delta > nextDelta) {
        delta = nextDelta
      } else {
        break
      }
      bidAmount =
        remainer > expectedRemainer
          ? bidAmount.add(delta)
          : bidAmount.sub(delta)
    }
    return bidAmount
  },

  deposit: (
    deltaA: BN,
    deltaB: BN,
    reserveA: BN,
    reserveB: BN,
    liquidity: BN,
  ) => {
    if (!reserveA && !reserveB) {
      const lpt = sqrtBN(deltaA.mul(deltaB))
      return {
        deltaA,
        deltaB,
        lpt,
        newReserveA: deltaA,
        newReserveB: deltaB,
        newLiquidity: lpt,
      }
    }
    const [a, b] = oracle.extract(deltaA, deltaB, reserveA, reserveB)
    const lpt = a.mul(liquidity).div(reserveA)
    const newReserveA = a.add(reserveA)
    const newReserveB = b.add(reserveB)
    const newLiquidity = liquidity.add(lpt)
    return { deltaA: a, deltaB: b, lpt, newReserveA, newReserveB, newLiquidity }
  },

  sided_deposit: (
    deltaA: BN,
    deltaB: BN,
    reserveA: BN,
    reserveB: BN,
    liquidity: BN,
    feeRatio: BN,
    taxRatio: BN,
  ) => {
    const {
      deltaA: unrakedAStar,
      deltaB: unrakedBStar,
      newReserveA: unrakedReserveA,
      newReserveB: unrakedReserveB,
      lpt: unrakedLpt,
      newLiquidity: unrakedLiquidity,
    } = oracle.deposit(deltaA, deltaB, reserveA, reserveB, liquidity)
    const aRemainer = deltaA.sub(unrakedAStar)
    const bRemainer = deltaB.sub(unrakedBStar)
    if (aRemainer > new BN(0)) {
      const bidAmount = oracle.rake(
        aRemainer,
        unrakedReserveA,
        unrakedReserveB,
        feeRatio,
        taxRatio,
      )
      const { askAmount, newReserveBid, newReserveAsk } = oracle.swap(
        bidAmount,
        unrakedReserveA,
        unrakedReserveB,
        feeRatio,
        taxRatio,
      )
      const {
        deltaA: rakedAStar,
        deltaB: rakedBStar,
        lpt: rakedLpt,
        newReserveA,
        newReserveB,
        newLiquidity,
      } = oracle.deposit(
        aRemainer.sub(bidAmount),
        askAmount,
        newReserveBid,
        newReserveAsk,
        unrakedLiquidity,
      )
      return {
        deltaA: unrakedAStar.add(bidAmount).add(rakedAStar),
        deltaB: unrakedBStar.add(rakedBStar).sub(askAmount),
        lpt: unrakedLpt.add(rakedLpt),
        newReserveA,
        newReserveB,
        newLiquidity,
      }
    }

    if (bRemainer > new BN(0)) {
      const bidAmount = oracle.rake(
        bRemainer,
        unrakedReserveB,
        unrakedReserveA,
        feeRatio,
        taxRatio,
      )
      const { askAmount, newReserveBid, newReserveAsk } = oracle.swap(
        bidAmount,
        unrakedReserveB,
        unrakedReserveA,
        feeRatio,
        taxRatio,
      )
      const {
        deltaA: rakedAStar,
        deltaB: rakedBStar,
        lpt: rakedLpt,
        newReserveA,
        newReserveB,
        newLiquidity,
      } = oracle.deposit(
        askAmount,
        bRemainer.sub(bidAmount),
        newReserveAsk,
        newReserveBid,
        unrakedLiquidity,
      )
      return {
        deltaA: unrakedAStar.add(rakedAStar).sub(askAmount),
        deltaB: unrakedBStar.add(bidAmount).add(rakedBStar),
        lpt: unrakedLpt.add(rakedLpt),
        newReserveA,
        newReserveB,
        newLiquidity,
      }
    }

    return {
      deltaA: unrakedAStar,
      deltaB: unrakedBStar,
      lpt: unrakedLpt,
      newReserveA: unrakedReserveA,
      newReserveB: unrakedReserveB,
      newLiquidity: unrakedLiquidity,
    }
  },

  withdraw: (lpt: BN, liquidity: BN, reserveA: BN, reserveB: BN) => {
    const deltaA = reserveA.mul(lpt).div(liquidity)
    const deltaB = reserveB.mul(lpt).div(liquidity)
    const newReserveA = reserveA.sub(deltaA)
    const newReserveB = reserveB.sub(deltaB)
    return { deltaA, deltaB, newReserveA, newReserveB }
  },

  fee: (askAmount: BN, feeRatio: BN, taxRatio: BN) => {
    const fee = askAmount.mul(feeRatio).div(PRECISION)
    const tempAmount = askAmount.sub(fee)
    const tax = tempAmount.mul(taxRatio).div(PRECISION)
    const amount = tempAmount.sub(tax)
    return { askAmount: amount, fee, tax }
  },

  swap: (
    bidAmount: BN,
    reserveBid: BN,
    reserveAsk: BN,
    feeRatio: BN,
    taxRatio: BN,
  ) => {
    const newReserveBid = reserveBid.add(bidAmount)
    const tempReserveAsk = reserveBid.mul(reserveAsk).div(newReserveBid)
    const tempAskAmount = reserveAsk.sub(tempReserveAsk)
    const { askAmount, fee, tax } = oracle.fee(
      tempAskAmount,
      feeRatio,
      taxRatio,
    )
    const newReserveAsk = tempReserveAsk.add(fee)
    return { askAmount, tax, newReserveBid, newReserveAsk }
  },

  inverseSwap: (
    askAmount: BN,
    reserveBid: BN,
    reserveAsk: BN,
    feeRatio: BN,
    taxRatio: BN,
  ) => {
    const tempAskAmount = askAmount
      .mul(PRECISION)
      .pow(new BN(2))
      .div(PRECISION.sub(taxRatio))
      .div(PRECISION.sub(feeRatio))
    const tempReserveAsk = reserveAsk.sub(tempAskAmount)
    const tempReserveBid = reserveBid.mul(reserveAsk).div(tempReserveAsk)
    return tempReserveBid.sub(reserveBid)
  },

  /**
   * Slippage rate describes how price changes
   * It's decimalized by 9
   * @param bidAmount
   * @param reserveBid
   * @param reserveAsk
   * @returns
   */
  slippage: (
    bidAmount: BN,
    reserveBid: BN,
    reserveAsk: BN,
    feeRatio: BN,
    taxRatio: BN,
  ) => {
    const { newReserveBid, newReserveAsk } = oracle.swap(
      bidAmount,
      reserveBid,
      reserveAsk,
      feeRatio,
      taxRatio,
    )
    const prevPrice = reserveAsk.mul(PRECISION).div(reserveBid)
    const nextPrice = newReserveAsk.mul(PRECISION).div(newReserveBid)
    return (
      nextPrice > prevPrice
        ? nextPrice.sub(prevPrice)
        : prevPrice.sub(nextPrice)
    )
      .mul(PRECISION)
      .div(prevPrice)
  },
}

export default oracle
