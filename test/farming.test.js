const { Farming, SPLT, RawWallet, Lamports, account } = require('../dist')
const { payer, mints } = require('./config')

const wallet = new RawWallet(payer.secretKey)
// Primary Mint
const { address: MINT_ADDRESS_0 } = mints[0]
// Mint 1
const { address: MINT_ADDRESS_1 } = mints[1]
// Farm
let FARM_ADDRESS = ''
let DEBT_ADDRESS = ''

describe('Farming library', function () {
  it('Farm', async function () {
    const farming = new Farming()
    const payerAddress = await wallet.getAddress()
    const { farmAddress } = await farming.initializeFarm(
      1000000000n,
      5n,
      payerAddress,
      MINT_ADDRESS_1,
      MINT_ADDRESS_0,
      wallet,
    )
    FARM_ADDRESS = farmAddress
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
      console.log('FARM_ADDRESS:', FARM_ADDRESS)
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
          throw new Error('An invalid address was skipped')
      }
    })
  })

  describe('Test Farm', function () {
    it('Should be a valid farm data', async function () {
      const farming = new Farming()
      await farming.getFarmData(FARM_ADDRESS)
    })

    it('Should seed', async function () {
      const farming = new Farming()
      const payerAddress = await wallet.getAddress()
      const srcAddress = await account.deriveAssociatedAddress(
        payerAddress,
        MINT_ADDRESS_0,
      )
      await farming.seed(1000000000000n, FARM_ADDRESS, srcAddress, wallet)
    })

    it('Should unseed', async function () {
      const farming = new Farming()
      const payerAddress = await wallet.getAddress()
      const dstAddress = await account.deriveAssociatedAddress(
        payerAddress,
        MINT_ADDRESS_0,
      )
      await farming.unseed(900000000000n, FARM_ADDRESS, dstAddress, wallet)
    })
  })

  describe('Test accounts', function () {
    it('Should initialize rewarded & debt accounts', async function () {
      const farming = new Farming()
      const ownerAddress = await wallet.getAddress()
      const { rewardedAddress, debtAddress } = await farming.initializeAccounts(
        FARM_ADDRESS,
        ownerAddress,
        wallet,
      )
      const expectedAddress = await account.deriveAssociatedAddress(
        ownerAddress,
        MINT_ADDRESS_0,
      )
      if (rewardedAddress !== expectedAddress)
        throw new Error('Incorrect rewarded address')
      DEBT_ADDRESS = debtAddress
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
        FARM_ADDRESS,
        wallet,
      )
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, 10000)))()
      await farming.stake(
        10000000000n,
        srcAddress,
        rewardedAddress,
        FARM_ADDRESS,
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
      const amount = 100000000n
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
      await splt.transfer(amount, tokenAddress, srcAddress, wallet)
      // Stake
      await farming.initializeAccounts(
        FARM_ADDRESS,
        secondaryAddress,
        secondary,
      )
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, 10000)))()
      await farming.stake(
        amount,
        srcAddress,
        rewardedAddress,
        FARM_ADDRESS,
        secondary,
      )
      // Unstake
      await farming.unstake(
        amount,
        tokenAddress,
        rewardedAddress,
        FARM_ADDRESS,
        secondary,
      )
      // Close
      await farming.closeDebt(FARM_ADDRESS, secondary)
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
        FARM_ADDRESS,
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
      await farming.harvest(FARM_ADDRESS, rewardedAddress, wallet)
    })

    it('Should close debt account', async function () {
      const farming = new Farming()
      const walletAddress = await wallet.getAddress()
      const { shares } = await farming.getDebtData(DEBT_ADDRESS)
      const dstAddress = await account.deriveAssociatedAddress(
        walletAddress,
        MINT_ADDRESS_1,
      )
      const rewardedAddress = await account.deriveAssociatedAddress(
        walletAddress,
        MINT_ADDRESS_0,
      )
      await farming.unstake(
        shares,
        dstAddress,
        rewardedAddress,
        FARM_ADDRESS,
        wallet,
      )
      await farming.closeDebt(FARM_ADDRESS, wallet)
    })
  })

  describe('Test farm owner', function () {
    it('Should freeze/thaw farm', async function () {
      const farming = new Farming()
      await farming.freeze(FARM_ADDRESS, wallet)
      const a = await farming.getFarmData(FARM_ADDRESS)
      if (a.state != 2) throw new Error('Cannot freeze farm')
      await farming.thaw(FARM_ADDRESS, wallet)
      const b = await farming.getFarmData(FARM_ADDRESS)
      if (b.state != 1) throw new Error('Cannot thaw farm')
    })

    it('Should transfer farm ownership', async function () {
      const lamports = new Lamports()
      const farming = new Farming()
      const newOwner = new RawWallet(account.createAccount().secretKey)
      const newOwnerAddress = await newOwner.getAddress()
      await lamports.airdrop(100000000, newOwnerAddress)
      // Transfer forward
      await farming.transferFarmOwnership(FARM_ADDRESS, newOwnerAddress, wallet)
      const a = await farming.getFarmData(FARM_ADDRESS)
      if (a.owner != newOwnerAddress)
        throw new Error('Cannot transfer farm ownership')
      // Transfer backward
      const walletAddress = await wallet.getAddress()
      await farming.transferFarmOwnership(FARM_ADDRESS, walletAddress, newOwner)
      const b = await farming.getFarmData(FARM_ADDRESS)
      if (b.owner != walletAddress)
        throw new Error('Cannot transfer farm ownership')
    })

    it('Close farm', async function () {
      const farming = new Farming()
      await farming.closeFarm(FARM_ADDRESS, wallet)
    })
  })
})
