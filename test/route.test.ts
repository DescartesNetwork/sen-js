import * as sj from '../dist'
import * as cfg from './config'
import { account } from '../dist'

jest.setTimeout(120 * 1000)

describe('testing routing swap', () => {

  let swap: sj.Swap
  let wallet: sj.RawWallet

  const payer = cfg.payer

  let srcAddresses: Array<string>

  const mintA = cfg.mints[0]
  const mintB = cfg.mints[1]
  const mintC = cfg.mints[2]

  let pool_AB_address: string
  let pool_AC_address: string
  let pool_BC_address: string

  beforeAll(async () => {
    const nodeUr = 'https://api.devnet.solana.com'
    swap = new sj.Swap(undefined, undefined, undefined, nodeUr)

    srcAddresses = await Promise.all(
      cfg.mints.map(({ address: mintAddress }) =>
        account.deriveAssociatedAddress(payer.address, mintAddress),
      ))

    wallet = new sj.RawWallet(payer.secretKey)

    const poolAB = await swap.initializePool(
      100000000000n,
      500000000000n,
      payer.address,
      srcAddresses[0],
      srcAddresses[1],
      srcAddresses[0],
      wallet,
    )
    pool_AB_address = poolAB.poolAddress

    const poolAC = await swap.initializePool(
      100000000000n,
      200000000000n,
      payer.address,
      srcAddresses[0],
      srcAddresses[2],
      srcAddresses[0],
      wallet,
    )
    pool_AC_address = poolAC.poolAddress

    const poolBC = await swap.initializePool(
      200000000000n,
      500000000000n,
      payer.address,
      srcAddresses[1],
      srcAddresses[2],
      srcAddresses[0],
      wallet,
    )
    pool_BC_address = poolBC.poolAddress
  })

  afterAll(async () => {
    console.log('finish testing')
  })

  test('routing swap should be success', async function() {
    await swap.route(
      100n,
      0n,
      [
        {
          srcAddress: srcAddresses[0],
          dstAddress: srcAddresses[1],
          poolAddress: pool_AB_address,
        },
        {
          srcAddress: srcAddresses[1],
          dstAddress: srcAddresses[2],
          poolAddress: pool_BC_address,
        },
      ],
      wallet,
    )
  }, 60000)

  test('routing swap should be failed because of treasury account not matched', async function() {
    try {
      await swap.route(
        100n,
        50000000000n,
        [
          {
            srcAddress: srcAddresses[0],
            dstAddress: srcAddresses[1],
            poolAddress: pool_AB_address,
          },
          {
            srcAddress: srcAddresses[1],
            dstAddress: srcAddresses[2],
            poolAddress: pool_AC_address, // reason: poolAddress must be pool_BC_address
          },
        ],
        wallet,
      )
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect(error).toHaveProperty('message', 'There is no treasury account matched')
    }
  })

  test('routing swap should be failed because of amount input is zero', async function() {
    try {
      const result = await swap.route(
        0n,
        20000000000n,
        [
          {
            srcAddress: srcAddresses[1],
            dstAddress: srcAddresses[0],
            poolAddress: pool_AB_address,
          },
        ],
        wallet,
      )
      console.log(result)
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect(error).toHaveProperty('message', 'Cannot input a zero amount')
    }
  })

  test('routing swap should be failed because of exceed limit', async function() {
    try {
      const result = await swap.route(
        10n,
        20000000000n,
        [
          {
            srcAddress: srcAddresses[1],
            dstAddress: srcAddresses[0],
            poolAddress: pool_AB_address,
          },
        ],
        wallet,
      )
      console.log(result)
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect(error).toHaveProperty('message', 'Exceed limit')
    }
  })
})