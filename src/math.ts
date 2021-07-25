import * as BN from 'bn.js'

const PRECISION = new BN('1000000000')

const math = {
  decimalize: (a: string | number, decimals: number): BigInt => {
    if (!a) return BigInt(0)
    if (decimals <= 0 || decimals % 1 != 0) return BigInt(0)
    const n = a.toString()
    const m = n.split('.')
    if (m.length > 2) throw new Error('Invalid number')
    if (m.length == 1) return BigInt(a) * BigInt(10 ** decimals)
    if (m[1].length >= decimals)
      return BigInt(m[0] + m[1].substring(0, decimals))
    else return BigInt(m[0] + m[1] + '0'.repeat(decimals - m[1].length))
  },

  undecimalize: (a: BigInt, decimals: number) => {
    if (!a) return '0'
    if (decimals <= 0 || decimals % 1 != 0) return '0'
    const n = a.toString()

    let integer =
      n.length > decimals ? n.substring(0, n.length - decimals) : '0'
    let fraction: string | string[] = ''
    if (n.length > decimals)
      fraction = n.substring(n.length - decimals, n.length)
    else if (n.length == decimals) fraction = n
    else fraction = '0'.repeat(decimals - n.length) + n

    fraction = fraction.split('')
    while (fraction[fraction.length - 1] === '0') fraction.pop()
    fraction = fraction.join('')
    if (!fraction) return integer
    return integer + '.' + fraction
  },

  div: (a: string | number | BigInt, b: string | number | BigInt): number => {
    if (!b) throw new Error('Cannot be divided by 0')
    if (!a) return 0
    const ba = new BN(a.toString())
    const bb = new BN(b.toString())
    const bc = ba.mul(PRECISION).div(bb)
    const c = bc.toString()
    if (c.length > 9)
      return parseFloat(
        c.substring(0, c.length - 9) +
          '.' +
          c.substring(c.length - 9, c.length),
      )
    else return parseFloat('0.' + '0'.repeat(9 - c.length) + c)
  },
}

export default math
