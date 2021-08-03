import axios from 'axios'
import * as BN from 'bn.js'
import * as nacl from 'tweetnacl'
import {
  AccountInfo,
  Commitment,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js'
import * as emoji from './assets/emoji.json'

const PRECISION = new BN('1000000000')

const util = {
  /**˝
   * Basic transaction fee
   */
  BASIC_TX_FEE: 0.000005,

  /**
   * Total number of emoji for address mapping
   */
  TOTAL_EMOJI: emoji.length,

  /**
   * Sol decimals
   */
  LAMPORTS_PER_SOL: LAMPORTS_PER_SOL,

  /**
   * Map an address to an emoji
   * @param seed maybe your address
   * @returns an emoji
   */
  randEmoji: (seed: string) => {
    const hash = nacl.hash(Buffer.from(seed))
    const shortenedHash = Buffer.from(hash.subarray(0, 4)).toString('hex')
    const index = parseInt(shortenedHash, 16)
    return emoji[index % util.TOTAL_EMOJI]
  },

  /**
   * Parse Coingecko
   * @param ticket Coingecko ticket of the coin/token
   * @returns icon, symcol, name, address, rank, price, priceChange (24h), totalVolume
   */
  parseCGK: async (ticket = '') => {
    if (!ticket) throw new Error('Ticket is empty')
    const {
      data: {
        image: { large, small, thumb },
        symbol: refSymbol,
        name,
        platforms: { solana },
        market_cap_rank: rank,
        market_data: {
          current_price: { usd: price },
          total_volume: { usd: totalVolume },
          price_change_percentage_24h: priceChange,
        },
      },
    } = await axios({
      method: 'get',
      url: 'https://api.coingecko.com/api/v3/coins/' + ticket,
    })
    const icon = large || thumb || small
    const symbol = refSymbol.toUpperCase()
    const address = solana
    return {
      icon,
      symbol,
      name,
      address,
      rank,
      price,
      priceChange,
      totalVolume,
    }
  },

  /**
   * Add decimals to the number
   * @param a
   * @param decimals
   * @returns
   */
  decimalize: (a: string | number, decimals: number): bigint => {
    if (!a) return BigInt(0)
    if (decimals < 0 || decimals % 1 != 0)
      throw new Error('decimals must be an integer greater than zero')
    const n = a.toString()
    if (!decimals) return BigInt(n)
    const m = n.split('.')
    if (m.length > 2) throw new Error('Invalid number')
    if (m.length == 1) return BigInt(a) * BigInt(10 ** decimals)
    if (m[1].length >= decimals)
      return BigInt(m[0] + m[1].substring(0, decimals))
    else return BigInt(m[0] + m[1] + '0'.repeat(decimals - m[1].length))
  },

  /**
   * Remove decimals from the number
   * @param a
   * @param decimals
   * @returns
   */
  undecimalize: (a: bigint, decimals: number) => {
    if (decimals < 0 || decimals % 1 != 0)
      throw new Error('decimals must be an integer greater than zero')
    if (!a) return '0'
    const n = a.toString()
    if (!decimals) return n

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

  /**
   * Divide two numbers
   * @param a
   * @param b
   * @returns
   */
  div: (a: string | number | bigint, b: string | number | bigint): number => {
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

  /**
   * Get multiple account info with 100 limit
   */
  wrappedGetMultipleAccountsInfo: async (
    connection: Connection,
    publicKeys: PublicKey[],
    commitment?: Commitment | undefined,
  ) => {
    const limit = 99
    const length = publicKeys.length
    const counter = Math.floor(length / limit) + 1
    let data: AccountInfo<Buffer>[] = []
    for (let i = 0; i < counter; i++) {
      const subPublicKeys = publicKeys.slice(limit * i, limit * (i + 1))
      const re = await connection.getMultipleAccountsInfo(
        subPublicKeys,
        commitment,
      )
      if (!re) continue
      data = data.concat(re)
    }
    return data
  },
}

export default util
