const { IDO, SPLT, RawWallet, Lamports, account } = require('../dist')
const { payer, mints } = require('./config')

const wallet = new RawWallet(payer.secretKey)
// Primary Mint
const { address: RAISED_MINT } = mints[0]
// Mint 1
const { address: SOLD_MINT } = mints[1]
// Farm
let IDO_ADDRESS = ''
let TICKET_ADDRESS = ''

const minute = 30n // 30 seconds
const startdate = global.BigInt(Math.floor(Number(new Date()) / 1000)) + minute
const middledate = startdate + minute
const enddate = middledate + minute
const redeemdate = enddate + minute

describe('IDO library', function () {
  it('IDO', async function () {
    const ido = new IDO()
    const { idoAddress } = await ido.initializeIDO(
      1000000000n,
      startdate,
      middledate,
      enddate,
      redeemdate,
      SOLD_MINT,
      RAISED_MINT,
      wallet,
    )
    IDO_ADDRESS = idoAddress
  })

  describe('Test constructor', function () {
    it('Should fill configs', async function () {
      // Payer
      const payerAddress = await wallet.getAddress()
      console.log('PAYER:', payerAddress)
      console.log('\n')
      // Mint 0 & 1
      console.log('SOLD_MINT:', SOLD_MINT)
      console.log('RAISED_MINT:', RAISED_MINT)
      console.log('\n')
      // IDO
      console.log('IDO_ADDRESS:', IDO_ADDRESS)
      console.log('\n')
    })

    it('Should be a valid default in constructor', function () {
      new IDO()
    })

    it('Should be a valid address in constructor', function () {
      new IDO('F5SvYWVLivzKc8XjoKaKxeXe2Yo8YZbJtbPbvq3b2sGj')
    })

    it('Should be an invalid address in constructor', function () {
      try {
        new IDO('abc')
        throw new Error('No error')
      } catch (er) {
        if (er.message === 'No error')
          throw new Error('An invalid address is skipped')
      }
    })
  })

  describe('Test IDO', function () {
    it('Should be a valid ido data', async function () {
      const ido = new IDO()
      await ido.getIDOData(IDO_ADDRESS)
    })

    it('Should seed', async function () {
      const ido = new IDO()
      const splt = new SPLT()
      const amount = 1000000000n
      const { sold_mint_treasury: soldMintTreasuryAddress } =
        await ido.getIDOData(IDO_ADDRESS)
      const { amount: prevAmount } = await splt.getAccountData(
        soldMintTreasuryAddress,
      )
      await ido.seed(amount, IDO_ADDRESS, wallet)
      const { amount: nextAmount } = await splt.getAccountData(
        soldMintTreasuryAddress,
      )
      if (nextAmount - prevAmount !== amount) throw new Error('Failed to seed')
    })

    it('Should unseed', async function () {
      const ido = new IDO()
      const splt = new SPLT()
      const amount = 1000000000n
      const { sold_mint_treasury: soldMintTreasuryAddress } =
        await ido.getIDOData(IDO_ADDRESS)
      const { amount: prevAmount } = await splt.getAccountData(
        soldMintTreasuryAddress,
      )
      await ido.unseed(amount, IDO_ADDRESS, wallet)
      const { amount: nextAmount } = await splt.getAccountData(
        soldMintTreasuryAddress,
      )
      if (prevAmount - nextAmount !== amount)
        throw new Error('Failed to unseed')
    })
  })

  describe('Test ticket', function () {
    it('Should initialize ticket account', async function () {
      const ido = new IDO()
      const ownerAddress = await wallet.getAddress()
      const { ticketAddress } = await ido.initializeTicket(IDO_ADDRESS, wallet)
      const expectedAddress = await ido.deriveTicketAddress(
        ownerAddress,
        IDO_ADDRESS,
      )
      if (ticketAddress !== expectedAddress)
        throw new Error('Incorrect ticket address')
      TICKET_ADDRESS = ticketAddress
    })

    it('Should be a ticket data', async function () {
      const ido = new IDO()
      await ido.getTicketData(TICKET_ADDRESS)
    })

    it('Should stake', async function () {
      const ido = new IDO()
      const splt = new SPLT()
      const amount = 10000000000n
      const { raised_mint_treasury: raisedMintTreasuryAddress, startdate } =
        await ido.getIDOData(IDO_ADDRESS)
      const { amount: prevAmount } = await splt.getAccountData(
        raisedMintTreasuryAddress,
      )
      const waiting = Math.max(Number(startdate) * 1000 - Number(new Date()), 0)
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, waiting)))()
      await ido.stake(amount, IDO_ADDRESS, wallet)
      const { amount: nextAmount } = await splt.getAccountData(
        raisedMintTreasuryAddress,
      )
      if (nextAmount - prevAmount !== amount) throw new Error('Failed to stake')
    })

    it('Should unstake', async function () {
      const ido = new IDO()
      const splt = new SPLT()
      const amount = 5000000000n
      const { raised_mint_treasury: raisedMintTreasuryAddress, middledate } =
        await ido.getIDOData(IDO_ADDRESS)
      const { amount: prevAmount } = await splt.getAccountData(
        raisedMintTreasuryAddress,
      )
      const waiting = Math.max(
        Number(middledate) * 1000 - Number(new Date()),
        0,
      )
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, waiting)))()
      await ido.unstake(amount, IDO_ADDRESS, wallet)
      const { amount: nextAmount } = await splt.getAccountData(
        raisedMintTreasuryAddress,
      )
      if (prevAmount - nextAmount !== amount)
        throw new Error('Failed to unstake')
    })

    it('Should failed to stake', async function () {
      const ido = new IDO()
      const amount = 10000000000n
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, 1000)))()
      try {
        await ido.stake(amount, IDO_ADDRESS, wallet)
        throw new Error('No error')
      } catch (er) {
        if (er.message === 'No error')
          throw new Error('An invalid staking was skipped')
      }
    })

    it('Should redeem', async function () {
      const ido = new IDO()
      const splt = new SPLT()
      const {
        sold_mint_treasury: soldMintTreasuryAddress,
        redeemdate,
        total_raised: totalRaised,
      } = await ido.getIDOData(IDO_ADDRESS)
      const { amount: prevAmount } = await splt.getAccountData(
        soldMintTreasuryAddress,
      )
      const { amount: prevTicketAmount } = await ido.getTicketData(
        TICKET_ADDRESS,
      )
      const waiting =
        Math.max(Number(redeemdate) * 1000 - Number(new Date()), 0) + 1000
      await (async () =>
        new Promise((resolve, _) => setTimeout(resolve, waiting)))()
      await ido.redeem(IDO_ADDRESS, wallet)
      const { amount: nextAmount } = await splt.getAccountData(
        soldMintTreasuryAddress,
      )
      const { amount: nextTicketAmount } = await ido.getTicketData(
        TICKET_ADDRESS,
      )
      const expectedAmount = (prevTicketAmount * prevAmount) / totalRaised
      if (nextTicketAmount !== 0n || prevAmount - nextAmount !== expectedAmount)
        throw new Error('Failed to redeem')
    })
  })

  describe('Test IDO owner', function () {
    it('Should collect', async function () {
      const ido = new IDO()
      const splt = new SPLT()
      const amount = 1000000000n
      const { raised_mint_treasury: raisedMintTreasuryAddress } =
        await ido.getIDOData(IDO_ADDRESS)
      const { amount: prevAmount } = await splt.getAccountData(
        raisedMintTreasuryAddress,
      )
      await ido.collect(amount, IDO_ADDRESS, wallet)
      const { amount: nextAmount } = await splt.getAccountData(
        raisedMintTreasuryAddress,
      )
      if (prevAmount - nextAmount !== amount)
        throw new Error('Failed to collect')
    })

    it('Should transfer ido ownership', async function () {
      const lamports = new Lamports()
      const ido = new IDO()
      const newOwner = new RawWallet(account.createAccount().secretKey)
      const newOwnerAddress = await newOwner.getAddress()
      await lamports.airdrop(100000000, newOwnerAddress)
      // Transfer forward
      await ido.transferIDOOwnership(IDO_ADDRESS, newOwnerAddress, wallet)
      const { owner: prevOwner } = await ido.getIDOData(IDO_ADDRESS)
      if (prevOwner != newOwnerAddress)
        throw new Error('Cannot transfer ido ownership')
      // Transfer backward
      const walletAddress = await wallet.getAddress()
      await ido.transferIDOOwnership(IDO_ADDRESS, walletAddress, newOwner)
      const { owner: nextOwner } = await ido.getIDOData(IDO_ADDRESS)
      if (nextOwner != walletAddress)
        throw new Error('Cannot transfer ido ownership')
    })
  })
})
