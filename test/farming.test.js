const {
  createAccount,
  Farming,
  SPLT,
  RawWallet,
  Lamports,
  account,
} = require('../dist')
const { payer, mints } = require('./config')

const wallet = new RawWallet(payer.secretKey)
// Primary Mint
const { address: MINT_ADDRESS_0 } = mints[0]
// Mint 1
const { address: MINT_ADDRESS_1 } = mints[1]
// Stake Pool
let STAKE_POOL_ADDRESS = ''
let MINT_SHARE_ADDRESS = ''
let SHARE_ADDRESS = ''
let DEBT_ADDRESS = ''

describe('Farming library', function () {
  it('Stake Pool', async function () {
    const farming = new Farming()
    const payerAddress = await wallet.getAddress()
    const { mintShareAddress, stakePoolAddress } =
      await farming.initializeStakePool(
        1000000000n,
        5n,
        payerAddress,
        MINT_ADDRESS_1,
        MINT_ADDRESS_0,
        wallet,
      )
    STAKE_POOL_ADDRESS = stakePoolAddress
    MINT_SHARE_ADDRESS = mintShareAddress
  })

  describe('Test constructor', function () {
    it('Should fill configs', async function () {
      // Payer
      const payerAddress = await wallet.getAddress()
      console.log('PAYER:', payerAddress)
      console.log('\n')
      // Mint 0 & 1
      console.log('MINT_ADDRESS_0:', MINT_ADDRESS_0)
      console.log('MINT_ADDRESS_1:', MINT_ADDRESS_1)
      console.log('\n')
      // Pool 0
      console.log('STAKE_POOL_ADDRESS:', STAKE_POOL_ADDRESS)
      console.log('MINT_SHARE_ADDRESS:', MINT_SHARE_ADDRESS)
      console.log('\n')
    })

    it('Should be a valid default in constructor', function () {
      new Farming()
    })

    it('Should be a valid address in constructor', function () {
      new Farming('F5SvYWVLivzKc8XjoKaKxeXe2Yo8YZbJtbPbvq3b2sGj')
    })

    it('Should be an invalid address in constructor', function () {
      try {
        new Farming('abc')
        throw new Error('No error')
      } catch (er) {
        if (er.message === 'No error')
          throw new Error('An invalid address is skipped')
      }
    })
  })

  describe('Test Stake Pool', function () {
    it('Should be a valid pool data', async function () {
      const farming = new Farming()
      await farming.getStakePoolData(STAKE_POOL_ADDRESS)
    })

    it('Should seed', async function () {
      const farming = new Farming()
      const payerAddress = await wallet.getAddress()
      const srcAddress = await account.deriveAssociatedAddress(
        payerAddress,
        MINT_ADDRESS_0,
      )
      await farming.seed(1000000000000n, STAKE_POOL_ADDRESS, srcAddress, wallet)
    })

    it('Should unseed', async function () {
      const farming = new Farming()
      const payerAddress = await wallet.getAddress()
      const dstAddress = await account.deriveAssociatedAddress(
        payerAddress,
        MINT_ADDRESS_0,
      )
      await farming.unseed(
        900000000000n,
        STAKE_POOL_ADDRESS,
        dstAddress,
        wallet,
      )
    })
  })

  describe('Test accounts', function () {
    it('Should initialize share & debt account', async function () {
      const farming = new Farming()
      const ownerAddress = await wallet.getAddress()
      const { shareAddress, debtAddress } = await farming.initializeAccount(
        STAKE_POOL_ADDRESS,
        ownerAddress,
        wallet,
      )
      SHARE_ADDRESS = shareAddress
      DEBT_ADDRESS = debtAddress
    })

    it('Should be a share data', async function () {
      const farming = new Farming()
      await farming.getShareData(SHARE_ADDRESS)
    })

    it('Should be a debt data', async function () {
      const farming = new Farming()
      await farming.getDebtData(DEBT_ADDRESS)
    })

    it('Should stake', async function () {
      const farming = new Farming()
      const payerAddress = await wallet.getAddress()
      const srcAddress = await account.deriveAssociatedAddress(
        payerAddress,
        MINT_ADDRESS_1,
      )
      const rewardedAddress = await account.deriveAssociatedAddress(
        payerAddress,
        MINT_ADDRESS_0,
      )
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, 10000)))()
      await farming.stake(
        10000000000n,
        srcAddress,
        rewardedAddress,
        STAKE_POOL_ADDRESS,
        wallet,
      )
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, 10000)))()
      await farming.stake(
        10000000000n,
        srcAddress,
        rewardedAddress,
        STAKE_POOL_ADDRESS,
        wallet,
      )
    })

    it('Should add more stakers', async function () {
      const splt = new SPLT()
      const farming = new Farming()
      const lamports = new Lamports()
      const payerAddress = await wallet.getAddress()
      const tokenAddress = await account.deriveAssociatedAddress(
        payerAddress,
        MINT_ADDRESS_1,
      )
      // Create & fund wallet
      const secondary = new RawWallet(
        Buffer.from(account.createAccount().secretKey).toString('hex'),
      )
      const secondaryAddress = await secondary.getAddress()
      await lamports.airdrop(10000000n, secondaryAddress)
      // Fund account
      const { accountAddress: srcAddress } = await splt.initializeAccount(
        MINT_ADDRESS_1,
        secondaryAddress,
        secondary,
      )
      const { accountAddress: rewardedAddress } = await splt.initializeAccount(
        MINT_ADDRESS_0,
        secondaryAddress,
        secondary,
      )
      await splt.transfer(10000000000n, tokenAddress, srcAddress, wallet)
      // Stake
      await farming.initializeAccount(
        STAKE_POOL_ADDRESS,
        secondaryAddress,
        secondary,
      )
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, 10000)))()
      await farming.stake(
        10000000000n,
        srcAddress,
        rewardedAddress,
        STAKE_POOL_ADDRESS,
        secondary,
      )
    })

    it('Should unstake', async function () {
      const farming = new Farming()
      const walletAddress = await wallet.getAddress()
      const dstAddress = await account.deriveAssociatedAddress(
        walletAddress,
        MINT_ADDRESS_1,
      )
      const rewardedAddress = await account.deriveAssociatedAddress(
        walletAddress,
        MINT_ADDRESS_0,
      )
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, 10000)))()
      await farming.unstake(
        10000000000n,
        dstAddress,
        rewardedAddress,
        STAKE_POOL_ADDRESS,
        wallet,
      )
    })

    it('Should harvest', async function () {
      const farming = new Farming()
      const walletAddress = await wallet.getAddress()
      const rewardedAddress = await account.deriveAssociatedAddress(
        walletAddress,
        MINT_ADDRESS_0,
      )
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, 10000)))()
      await farming.harvest(STAKE_POOL_ADDRESS, rewardedAddress, wallet)
    })
  })

  describe('Test stake pool owner', function () {
    it('Should freeze/thaw stake pool', async function () {
      const farming = new Farming()
      await farming.freezeStakePool(STAKE_POOL_ADDRESS, wallet)
      const a = await farming.getStakePoolData(STAKE_POOL_ADDRESS)
      if (a.state != 2) throw new Error('Cannot freeze stake pool')
      await farming.thawStakePool(STAKE_POOL_ADDRESS, wallet)
      const b = await farming.getStakePoolData(STAKE_POOL_ADDRESS)
      if (b.state != 1) throw new Error('Cannot thaw stake pool')
    })

    it('Should transfer stake pool ownership', async function () {
      const farming = new Farming()
      const newOwnerAddress = account.createAccount().publicKey.toBase58()
      await farming.transferStakePoolOwnership(
        STAKE_POOL_ADDRESS,
        newOwnerAddress,
        wallet,
      )
      const data = await farming.getStakePoolData(STAKE_POOL_ADDRESS)
      if (data.owner != newOwnerAddress)
        throw new Error('Cannot transfer stake pool ownership')
    })
  })
})
