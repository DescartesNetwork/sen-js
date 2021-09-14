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

const PRECISION = BigInt(1000000000000000000) // 10^18
const FEE = BigInt(2500000000000000) // 0.25%
const TAX = BigInt(500000000000000) // 0.05%

const oracle = {
  rake: (a: bigint, b: bigint, reserveA: bigint, reserveB: bigint) => {
    if (!a || !b || !reserveA || !reserveB)
      throw new Error('Invalid deposit/reserves')
    const l = a * reserveB
    const r = b * reserveA
    if (l > r) return [r / reserveB, b]
    if (l < r) return [a, l / reserveA]
    return [a, b]
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
      return { deltaA, deltaB, newReserveA: deltaA, newReserveB: deltaB, lpt }
    }
    const [a, b] = oracle.rake(deltaA, deltaB, reserveA, reserveB)
    const lpt = (a * liquidity) / reserveA
    const newReserveA = a + reserveA
    const newReserveB = b + reserveB
    return { deltaA: a, deltaB: b, newReserveA, newReserveB, lpt }
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

  fee: (askAmount: bigint) => {
    const fee = (askAmount * FEE) / PRECISION
    const tax = (askAmount * TAX) / PRECISION
    const amount = askAmount - fee - tax
    return { askAmount: amount, fee, tax }
  },

  swap: (bidAmount: bigint, reserveBid: bigint, reserveAsk: bigint) => {
    const newReserveBid = reserveBid + bidAmount
    const tempReserveAsk = (reserveBid * reserveAsk) / newReserveBid
    const tempAskAmount = reserveAsk - tempReserveAsk
    const { askAmount, fee, tax } = oracle.fee(tempAskAmount)
    const newReserveAsk = tempReserveAsk + fee
    return { askAmount, tax, newReserveBid, newReserveAsk }
  },

  inverseSwap: (askAmount: bigint, reserveBid: bigint, reserveAsk: bigint) => {
    const tempAskAmount = (askAmount * PRECISION) / (PRECISION - FEE - TAX)
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
  slippage: (bidAmount: bigint, reserveBid: bigint, reserveAsk: bigint) => {
    const { newReserveBid, newReserveAsk } = oracle.swap(
      bidAmount,
      reserveBid,
      reserveAsk,
    )
    const prevPrice = (reserveAsk * PRECISION) / reserveBid
    const nextPrice = (newReserveAsk * PRECISION) / newReserveBid
    return (
      ((nextPrice > prevPrice ? nextPrice - prevPrice : prevPrice - nextPrice) *
        PRECISION.sqrt()) /
      prevPrice
    )
  },
}

export default oracle
