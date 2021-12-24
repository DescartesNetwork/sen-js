const { Stake, SPLT, RawWallet, Lamports, account } = require('../dist')
const { payer, mints } = require('./config')

const wallet = new RawWallet(payer.secretKey)
// Primary Mint
const { address: MINT_ADDRESS_0 } = mints[0]
// Mint 1
const { address: MINT_ADDRESS_1 } = mints[1]
// Stake
let FARM_ADDRESS = ''
let DEBT_INDEX = 0
let DEBT_ADDRESS = ''

describe('Stake library', function () {
  it('Stake', async function () {
    const stake = new Stake()
    const payerAddress = await wallet.getAddress()
    const { farmAddress } = await stake.initializeFarm(
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
      new Stake()
    })

    it('Should be a valid address in constructor', function () {
      new Stake('F5SvYWVLivzKc8XjoKaKxeXe2Yo8YZbJtbPbvq3b2sGj')
    })

    it('Should be an invalid address in constructor', function () {
      try {
        new Stake('abc')
        throw new Error('No error')
      } catch (er) {
        if (er.message === 'No error')
          throw new Error('An invalid address was skipped')
      }
    })
  })

  describe('Test Farm', function () {
    it('Should be a valid farm data', async function () {
      const stake = new Stake()
      const data = await stake.getFarmData(FARM_ADDRESS)
      // console.log(data)
    })

    it('Should seed', async function () {
      const stake = new Stake()
      const payerAddress = await wallet.getAddress()
      const srcAddress = await account.deriveAssociatedAddress(
        payerAddress,
        MINT_ADDRESS_0,
      )
      await stake.seed(1000000000000n, FARM_ADDRESS, srcAddress, wallet)
    })

    it('Should unseed', async function () {
      const stake = new Stake()
      const payerAddress = await wallet.getAddress()
      const dstAddress = await account.deriveAssociatedAddress(
        payerAddress,
        MINT_ADDRESS_0,
      )
      await stake.unseed(900000000000n, FARM_ADDRESS, dstAddress, wallet)
    })
  })

  describe('Test accounts', function () {
    it('Should stake', async function () {
      const stake = new Stake()
      const payerAddress = await wallet.getAddress()
      const srcAddress = await account.deriveAssociatedAddress(
        payerAddress,
        MINT_ADDRESS_1,
      )
      const { debtAddress } = await stake.stake(
        DEBT_INDEX,
        10000000000n,
        srcAddress,
        FARM_ADDRESS,
        wallet,
      )
      DEBT_ADDRESS = debtAddress
    })

    it('Should harvest', async function () {
      const stake = new Stake()
      const walletAddress = await wallet.getAddress()
      const rewardedAddress = await account.deriveAssociatedAddress(
        walletAddress,
        MINT_ADDRESS_0,
      )
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, 10000)))()
      await stake.harvest(DEBT_INDEX, FARM_ADDRESS, rewardedAddress, wallet)
    })

    it('Should unstake', async function () {
      const stake = new Stake()
      const walletAddress = await wallet.getAddress()
      const dstAddress = await account.deriveAssociatedAddress(
        walletAddress,
        MINT_ADDRESS_1,
      )
      await stake.unstake(DEBT_INDEX, dstAddress, FARM_ADDRESS, wallet)
    })
  })

  describe('Test farm owner', function () {
    it('Should freeze/thaw farm', async function () {
      const stake = new Stake()
      await stake.freeze(FARM_ADDRESS, wallet)
      const a = await stake.getFarmData(FARM_ADDRESS)
      if (a.state != 2) throw new Error('Cannot freeze farm')
      await stake.thaw(FARM_ADDRESS, wallet)
      const b = await stake.getFarmData(FARM_ADDRESS)
      if (b.state != 1) throw new Error('Cannot thaw farm')
    })

    it('Should transfer farm ownership', async function () {
      const lamports = new Lamports()
      const stake = new Stake()
      const newOwner = new RawWallet(account.createAccount().secretKey)
      const newOwnerAddress = await newOwner.getAddress()
      await lamports.airdrop(100000000, newOwnerAddress)
      // Transfer forward
      await stake.transferFarmOwnership(FARM_ADDRESS, newOwnerAddress, wallet)
      const a = await stake.getFarmData(FARM_ADDRESS)
      if (a.owner != newOwnerAddress)
        throw new Error('Cannot transfer farm ownership')
      // Transfer backward
      const walletAddress = await wallet.getAddress()
      await stake.transferFarmOwnership(FARM_ADDRESS, walletAddress, newOwner)
      const b = await stake.getFarmData(FARM_ADDRESS)
      if (b.owner != walletAddress)
        throw new Error('Cannot transfer farm ownership')
    })
  })
})
