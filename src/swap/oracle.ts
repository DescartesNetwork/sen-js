declare global {
  interface BigInt {
    sqrt(): bigint
  }
}

BigInt.prototype.sqrt = function () {
  const self = this.valueOf()
  const one = BigInt(1)
  const two = BigInt(2)
  if (self < two) return self
  let bits = BigInt(this.toString(2).length + 1) / two
  let start = one << (bits - one)
  let end = one << (bits + one)
  while (start < end) {
    end = (start + end) / two
    start = self / end
  }
  return end
}

const PRECISION = BigInt(1000000000) // 10^9

const oracle = {
  extract: (a: bigint, b: bigint, reserveA: bigint, reserveB: bigint) => {
    if (!reserveA || !reserveB) throw new Error('Invalid deposit/reserves')
    if (!a || !b) return [0n, 0n]
    const l = a * reserveB
    const r = b * reserveA
    if (l > r) return [r / reserveB, b]
    if (l < r) return [a, l / reserveA]
    return [a, b]
  },

  rake: (
    amount: bigint,
    bidReserve: bigint,
    askReserve: bigint,
    feeRatio: bigint,
    taxRatio: bigint,
  ) => {
    let delta = amount
    let bidAmount = amount / 2n
    while (true) {
      const { askAmount, newReserveBid, newReserveAsk } = oracle.swap(
        bidAmount,
        bidReserve,
        askReserve,
        feeRatio,
        taxRatio,
      )
      const remainer = amount - bidAmount
      const expectedRemainer = (askAmount * newReserveBid) / newReserveAsk
      const nextDelta =
        remainer > expectedRemainer
          ? (remainer - expectedRemainer) / 2n
          : (expectedRemainer - remainer) / 2n
      if (delta > nextDelta) {
        delta = nextDelta
      } else {
        break
      }
      bidAmount =
        remainer > expectedRemainer ? bidAmount + delta : bidAmount - delta
    }
    return bidAmount
  },

  deposit: (
    deltaA: bigint,
    deltaB: bigint,
    reserveA: bigint,
    reserveB: bigint,
    liquidity: bigint,
  ) => {
    if (!reserveA && !reserveB) {
      const lpt = (deltaA * deltaB).sqrt()
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
    const lpt = (a * liquidity) / reserveA
    const newReserveA = a + reserveA
    const newReserveB = b + reserveB
    const newLiquidity = liquidity + lpt
    return { deltaA: a, deltaB: b, lpt, newReserveA, newReserveB, newLiquidity }
  },

  sided_deposit: (
    deltaA: bigint,
    deltaB: bigint,
    reserveA: bigint,
    reserveB: bigint,
    liquidity: bigint,
    feeRatio: bigint,
    taxRatio: bigint,
  ) => {
    const {
      deltaA: unrakedAStar,
      deltaB: unrakedBStar,
      newReserveA: unrakedReserveA,
      newReserveB: unrakedReserveB,
      lpt: unrakedLpt,
      newLiquidity: unrakedLiquidity,
    } = oracle.deposit(deltaA, deltaB, reserveA, reserveB, liquidity)
    const aRemainer = deltaA - unrakedAStar
    const bRemainer = deltaB - unrakedBStar
    if (aRemainer > 0n) {
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
        aRemainer - bidAmount,
        askAmount,
        newReserveBid,
        newReserveAsk,
        unrakedLiquidity,
      )
      return {
        deltaA: unrakedAStar + bidAmount + rakedAStar,
        deltaB: unrakedBStar + rakedBStar - askAmount,
        lpt: unrakedLpt + rakedLpt,
        newReserveA,
        newReserveB,
        newLiquidity,
      }
    }

    if (bRemainer > 0n) {
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
        bRemainer - bidAmount,
        newReserveAsk,
        newReserveBid,
        unrakedLiquidity,
      )
      return {
        deltaA: unrakedAStar + rakedAStar - askAmount,
        deltaB: unrakedBStar + bidAmount + rakedBStar,
        lpt: unrakedLpt + rakedLpt,
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

  withdraw: (
    lpt: bigint,
    liquidity: bigint,
    reserveA: bigint,
    reserveB: bigint,
  ) => {
    const deltaA = (reserveA * lpt) / liquidity
    const deltaB = (reserveB * lpt) / liquidity
    const newReserveA = reserveA - deltaA
    const newReserveB = reserveB - deltaB
    return { deltaA, deltaB, newReserveA, newReserveB }
  },

  fee: (askAmount: bigint, feeRatio: bigint, taxRatio: bigint) => {
    const fee = (askAmount * feeRatio) / PRECISION
    const tempAmount = askAmount - fee
    const tax = (tempAmount * taxRatio) / PRECISION
    const amount = tempAmount - tax
    return { askAmount: amount, fee, tax }
  },

  swap: (
    bidAmount: bigint,
    reserveBid: bigint,
    reserveAsk: bigint,
    feeRatio: bigint,
    taxRatio: bigint,
  ) => {
    const newReserveBid = reserveBid + bidAmount
    const tempReserveAsk = (reserveBid * reserveAsk) / newReserveBid
    const tempAskAmount = reserveAsk - tempReserveAsk
    const { askAmount, fee, tax } = oracle.fee(
      tempAskAmount,
      feeRatio,
      taxRatio,
    )
    const newReserveAsk = tempReserveAsk + fee
    return { askAmount, tax, newReserveBid, newReserveAsk }
  },

  inverseSwap: (
    askAmount: bigint,
    reserveBid: bigint,
    reserveAsk: bigint,
    feeRatio: bigint,
    taxRatio: bigint,
  ) => {
    const tempAskAmount =
      (askAmount * PRECISION ** 2n) /
      (PRECISION - taxRatio) /
      (PRECISION - feeRatio)
    const tempReserveAsk = reserveAsk - tempAskAmount
    const tempReserveBid = (reserveBid * reserveAsk) / tempReserveAsk
    return tempReserveBid - reserveBid
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
    bidAmount: bigint,
    reserveBid: bigint,
    reserveAsk: bigint,
    feeRatio: bigint,
    taxRatio: bigint,
  ) => {
    const { newReserveBid, newReserveAsk } = oracle.swap(
      bidAmount,
      reserveBid,
      reserveAsk,
      feeRatio,
      taxRatio,
    )
    const prevPrice = (reserveAsk * PRECISION) / reserveBid
    const nextPrice = (newReserveAsk * PRECISION) / newReserveBid
    return (
      ((nextPrice > prevPrice ? nextPrice - prevPrice : prevPrice - nextPrice) *
        PRECISION) /
      prevPrice
    )
  },
}

export default oracle
