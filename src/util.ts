import axios from 'axios'
import * as nacl from 'tweetnacl'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import * as emoji from './data/emoji.json'

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
}

export default util
