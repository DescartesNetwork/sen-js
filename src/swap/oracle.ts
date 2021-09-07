const BN = require('bn.js')

// BN.js patch: sqrt()
BN.prototype.sqrt = function () {
  if (this.lt(new BN(2))) return this
  const bits = Math.floor((this.bitLength() + 1) / 2)
  let start = new BN(1).shln(bits - 1)
  let end = new BN(1).shln(bits + 1)
  while (start.lt(end)) {
    end = start.add(end).shrn(1)
    start = this.div(end)
  }
  return end
}

const PRECISION = new BN('1000000000000000000') // 10^18
const TAX = new BN('500000000000000') // 0.05%

const oracle = {
  checkLiquidity: (
    deltaA: bigint,
    deltaB: bigint,
    reserveA: bigint,
    reserveB: bigint,
  ) => {
    if (!deltaA || !deltaB) return false
    if (!reserveA || !reserveB) return true
    const ratio = (deltaA * PRECISION) / deltaB
    const expectedRatio = (reserveA * PRECISION) / reserveB
    return ratio === expectedRatio
  },

  deposit: (
    deltaA: bigint,
    deltaB: bigint,
    reserveA: bigint,
    reserveB: bigint,
  ) => {
    const deltaLiquidity = BigInt(
      new BN((deltaA * deltaB).toString()).sqrt().toString(),
    )
    const liquidity = BigInt(
      new BN((reserveA * reserveB).toString()).sqrt().toString(),
    )
    const newLiquidity = deltaLiquidity + liquidity
    const newReserveA = deltaA + reserveA
    const newReserveB = deltaB + reserveB
    return {
      deltaLiquidity,
      newLiquidity,
      newReserveA,
      newReserveB,
    }
  },

  withdraw: (deltaLiquidity: bigint, reserveA: bigint, reserveB: bigint) => {
    const liquidity = BigInt(
      new BN((reserveA * reserveB).toString()).sqrt().toString(),
    )
    const deltaA = (reserveA * deltaLiquidity) / liquidity
    const deltaB = (reserveB * deltaLiquidity) / liquidity
    const newLiquidity = liquidity - deltaLiquidity
    const newReserveA = reserveA - deltaA
    const newReserveB = reserveB - deltaB
    return {
      deltaA,
      deltaB,
      newLiquidity,
      newReserveA,
      newReserveB,
    }
  },

  adaptiveFee: (askAmount: bigint, alpha: bigint) => {
    const numerator = PRECISION - alpha
    const denominator = BigInt(2) * PRECISION - alpha
    const fee = (askAmount * numerator) / denominator
    const amount = askAmount - fee
    return { amount, fee }
  },

  tax: (askAmount: bigint) => {
    const tax = (askAmount * TAX) / PRECISION
    const amount = askAmount - tax
    return { amount, tax }
  },

  swap: (bidAmount: bigint, reserveBid: bigint, reserveAsk: bigint) => {
    const newReserveBid = reserveBid + bidAmount
    const tempReserveAsk = (reserveBid * reserveAsk) / newReserveBid
    const tempAskAmount = reserveAsk - tempReserveAsk
    const alpha = (reserveBid * PRECISION) / newReserveBid
    const { fee } = oracle.adaptiveFee(tempAskAmount, alpha)
    const { tax } = oracle.tax(tempAskAmount)
    const askAmount = tempAskAmount - fee - tax
    const newReserveAsk = tempReserveAsk + fee
    return { askAmount, newReserveBid, newReserveAsk }
  },
}

export default oracle
