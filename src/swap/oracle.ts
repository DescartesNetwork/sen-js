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
// BN.js patch: cbrt()
BN.prototype.cbrt = function () {
  if (this.lt(new BN(2))) return this
  const bits = Math.floor(this.bitLength() / 3)
  let end = new BN(1).shln(bits)
  while (true) {
    let next = this.div(end.pow(new BN(2)))
      .add(end.mul(new BN(2)))
      .div(new BN(3))
    if (end.eq(next)) return end
    end = next
  }
}

const TRIPPLE_PRECISION = new BN('1000000000000000000')

const oracle = {
  /**
   * Curve & Inverse Curve
   */
  _curve: (
    bidAmount: bigint,
    bidReserve: bigint,
    askReserve: bigint,
  ): bigint => {
    const newBidReserve = bidAmount + bidReserve
    const newAskReserve = (bidReserve * askReserve) / newBidReserve
    const askAmount = askReserve - newAskReserve
    return askAmount
  },
  _inverseCurve: (
    askAmount: bigint,
    bidReserve: bigint,
    askReserve: bigint,
  ): bigint => {
    const newAskReserve = askReserve - askAmount
    const newBidReserve = (bidReserve * askReserve) / newAskReserve
    const bidAmount = newBidReserve - bidReserve
    return bidAmount
  },

  /**
   * Single Rake && Multiple Rake
   */
  _rake: (
    delta: typeof BN,
    reserveS: typeof BN,
    reserveA: typeof BN,
    reserveB: typeof BN,
  ) => {
    if (reserveS.isZero() || reserveA.isZero() || reserveB.isZero())
      throw new Error('Invalid reserve')
    if (delta.isZero()) return [new BN(0), new BN(0), new BN(0)]
    const cbrtOfDeltaPlusReserve = delta
      .add(reserveS)
      .mul(TRIPPLE_PRECISION)
      .cbrt()
    const cbrtOfReserce = reserveS.mul(TRIPPLE_PRECISION).cbrt()
    const z = cbrtOfDeltaPlusReserve
      .pow(new BN(2))
      .mul(cbrtOfReserce)
      .div(TRIPPLE_PRECISION)
      .sub(reserveS)
    const x = z.add(reserveS).mul(reserveS).sqrt().sub(reserveS)
    const y = z.sub(x)
    const s = delta.sub(z)
    const a = reserveA.mul(x).div(reserveS.add(x))
    const b = reserveB.mul(y).div(reserveS.add(z))
    return [s, a, b]
  },

  /**
   * Main
   */
  curve: (
    bidAmount: bigint,
    bidReserve: bigint,
    askReserve: bigint,
    fee: bigint,
    feeDecimals: bigint,
  ): bigint => {
    const askAmountWithoutFee = oracle._curve(bidAmount, bidReserve, askReserve)
    const askAmount = (askAmountWithoutFee * (feeDecimals - fee)) / feeDecimals
    return askAmount
  },

  inverseCurve: (
    askAmount: bigint,
    bidReserve: bigint,
    askReserve: bigint,
    fee: bigint,
    feeDecimals: bigint,
  ): bigint => {
    const askAmountWithFee = (askAmount * feeDecimals) / (feeDecimals - fee)
    const bidAmount = oracle._inverseCurve(
      askAmountWithFee,
      bidReserve,
      askReserve,
    )
    return bidAmount
  },

  slippage: (
    bidAmount: bigint,
    bidReserve: bigint,
    askReserve: bigint,
    fee: bigint,
    feeDecimals: bigint,
  ): bigint => {
    const askAmount = oracle.curve(
      bidAmount,
      bidReserve,
      askReserve,
      fee,
      feeDecimals,
    )
    const newBidReserve = bidAmount + bidReserve
    const newAskReserve = askReserve - askAmount
    const slippage =
      ((newBidReserve * askReserve - newAskReserve * bidReserve) *
        feeDecimals) /
      (newBidReserve * askReserve)
    return slippage
  },

  rake: (
    deltaS: bigint,
    deltaA: bigint,
    deltaB: bigint,
    reserveS: bigint,
    reserveA: bigint,
    reserveB: bigint,
    reserveLPT: bigint,
  ) => {
    let _reserveSPrime = new BN(0)
    const _deltaS = new BN(deltaS.toString())
    const _deltaA = new BN(deltaA.toString())
    const _deltaB = new BN(deltaB.toString())
    let _reserveS = new BN(reserveS.toString())
    let _reserveA = new BN(reserveA.toString())
    let _reserveB = new BN(reserveB.toString())
    let _reserveLPT = new BN(reserveLPT.toString())

    const [s1, a1, b1] = oracle._rake(_deltaS, _reserveS, _reserveA, _reserveB)
    _reserveS = _reserveS.add(_deltaS)
    _reserveSPrime = _reserveS.sub(s1)
    const lpt1 = s1.mul(_reserveLPT).div(_reserveSPrime)
    _reserveLPT = _reserveLPT.add(lpt1)

    const [a2, b2, s2] = oracle._rake(_deltaA, _reserveA, _reserveB, _reserveS)
    _reserveA = _reserveA.add(_deltaA)
    _reserveSPrime = _reserveS.sub(s2)
    const lpt2 = s2.mul(_reserveLPT).div(_reserveSPrime)
    _reserveLPT = _reserveLPT.add(lpt2)

    const [b3, s3, a3] = oracle._rake(_deltaB, _reserveB, _reserveS, _reserveA)
    _reserveB = _reserveB.add(_deltaB)
    _reserveSPrime = _reserveS.sub(s3)
    const lpt3 = s3.mul(_reserveLPT).div(_reserveSPrime)
    const lpt = lpt1.add(lpt2).add(lpt3)

    return {
      lpt: BigInt(lpt.toString()),
      newReserveS: BigInt(_reserveS.toString()),
      newReserveA: BigInt(_reserveA.toString()),
      newReserveB: BigInt(_reserveB.toString()),
    }
  },
}

export default oracle
