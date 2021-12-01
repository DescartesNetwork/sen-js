import {
  Transaction,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  PublicKey,
  GetProgramAccountsFilter,
  KeyedAccountInfo,
} from '@solana/web3.js'

import Tx from './core/tx'
import SPLT from './splt'
import account from './account'
import schema, { IDOData, TicketData } from './schema'
import {
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_IDO_PROGRAM_ADDRESS,
} from './default'
import { WalletInterface } from './rawWallet'

const soproxABI = require('soprox-abi')

export type IDOAccountChangeInfo = {
  type: 'ido' | 'ticket'
  address: string
  data: Buffer
}

const ErrorMapping = [
  'Invalid instruction',
  'Incorrect program id',
  'Invalid owner',
  'Operation overflowed',
  'Cannot initialize an IDO with two same mints',
  'The account was initialized already',
  'Cannot initialize an IDO in the past',
  'Cannot input a zero amount',
  'The provided accounts are unmatched to the ido',
  "The IDO hasn't been started yet",
  'Cannot seed/unseed after the IDO is running',
  'The phase has been ended',
  'Cannot redeem while the IDO is running',
]

class IDO extends Tx {
  idoProgramId: PublicKey
  spltProgramId: PublicKey
  splataProgramId: PublicKey
  private _splt: SPLT

  constructor(
    idoProgramAddress = DEFAULT_IDO_PROGRAM_ADDRESS,
    spltProgramAddress = DEFAULT_SPLT_PROGRAM_ADDRESS,
    splataProgramAddress = DEFAULT_SPLATA_PROGRAM_ADDRESS,
    nodeUrl: string,
  ) {
    super(nodeUrl, ErrorMapping)

    if (!account.isAddress(idoProgramAddress))
      throw new Error('Invalid ido program address')
    if (!account.isAddress(spltProgramAddress))
      throw new Error('Invalid SPL token program address')
    if (!account.isAddress(splataProgramAddress))
      throw new Error('Invalid SPL associated token program address')
    this.idoProgramId = account.fromAddress(idoProgramAddress)
    this.spltProgramId = account.fromAddress(spltProgramAddress)
    this.splataProgramId = account.fromAddress(splataProgramAddress)

    this._splt = new SPLT(spltProgramAddress, splataProgramAddress, nodeUrl)
  }

  /**
   * Watch account changes
   * @param callback - The callback will be called when there is any change
   * @param filters - GetProgramAccountsFilter - Ref: {@link https://solana-labs.github.io/solana-web3.js/modules.html#GetProgramAccountsFilter}
   * @returns Watch id
   */
  watch = (
    callback: (
      error: string | null,
      data:
        | (Omit<IDOAccountChangeInfo, 'data'> & {
            data: IDOData | TicketData
          })
        | null,
    ) => void,
    filters?: GetProgramAccountsFilter[],
  ): number => {
    const cb = ({
      accountId,
      accountInfo: { data: buf },
    }: KeyedAccountInfo) => {
      const address = accountId.toBase58()
      const idoSpace = new soproxABI.struct(schema.IDO_SCHEMA).space
      const ticketSpace = new soproxABI.struct(schema.TICKET_SCHEMA).space
      let type = null
      let data = {}
      if (buf.length === idoSpace) {
        type = 'ido'
        data = this.parseIDOData(buf)
      }
      if (buf.length === ticketSpace) {
        type = 'ticket'
        data = this.parseTicketData(buf)
      }
      if (!type) return callback('Unmatched type', null)
      return callback(null, {
        type: type as IDOAccountChangeInfo['type'],
        address,
        data: data as IDOData | TicketData,
      })
    }
    return this.connection.onProgramAccountChange(
      this.idoProgramId,
      cb,
      'confirmed',
      filters,
    )
  }

  /**
   * Unwatch a watcher by watch id
   * @param watchId - The watchId was returned by {@link https://descartesnetwork.github.io/sen-js/classes/Farming.html#watch | watch} function.
   * @returns
   */
  unwatch = async (watchId: number): Promise<void> => {
    if (!watchId) return
    return await this.connection.removeProgramAccountChangeListener(watchId)
  }

  /**
   * Parse ido buffer data
   * @param data - Buffer data (raw data) that you get by {@link https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getAccountInfo | connection.getAccountInfo}
   * @returns Readable json data respect to {@link https://descartesnetwork.github.io/sen-js/modules.html#schema | FARM_SCHEMA}
   */
  parseIDOData = (data: Buffer): IDOData => {
    const layout = new soproxABI.struct(schema.IDO_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get ido data
   * @param idoAddress - IDO account address
   * @returns Readable json data respect to {@link https://descartesnetwork.github.io/sen-js/modules.html#schema | FARM_SCHEMA}
   */
  getIDOData = async (idoAddress: string): Promise<IDOData> => {
    if (!account.isAddress(idoAddress)) throw new Error('Invalid ido address')
    const idoPublicKey = account.fromAddress(idoAddress)
    const { data } = (await this.connection.getAccountInfo(idoPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${idoAddress}`)
    return this.parseIDOData(data)
  }

  /**
   * Parse ticket buffer data
   * @param data - Buffer data (raw data) that you get by {@link https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getAccountInfo | connection.getAccountInfo}
   * @returns Readable json data respect to {@link https://descartesnetwork.github.io/sen-js/modules.html#schema | FARM_SCHEMA}
   */
  parseTicketData = (data: Buffer): TicketData => {
    const layout = new soproxABI.struct(schema.TICKET_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get ticket data
   * @param ticketAddress - Ticket account address
   * @returns Readable json data respect to {@link https://descartesnetwork.github.io/sen-js/modules.html#schema | FARM_SCHEMA}
   */
  getTicketData = async (ticketAddress: string): Promise<TicketData> => {
    if (!account.isAddress(ticketAddress))
      throw new Error('Invalid ticket address')
    const ticketPublicKey = account.fromAddress(ticketAddress)
    const { data } =
      (await this.connection.getAccountInfo(ticketPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${ticketAddress}`)
    return this.parseTicketData(data)
  }

  /**
   * Derive ticket address
   * @param ownerAddress - Owner address of the ticket account
   * @param idoAddress - Corresponding ido address to the ticket account
   * @returns Ticket account address
   */
  deriveTicketAddress = async (
    ownerAddress: string,
    idoAddress: string,
  ): Promise<string> => {
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    if (!account.isAddress(idoAddress)) throw new Error('Invalid ido address')
    const ownerPublicKey = account.fromAddress(ownerAddress)
    const idoPublicKey = account.fromAddress(idoAddress)
    const seeds = [
      ownerPublicKey.toBuffer(),
      idoPublicKey.toBuffer(),
      this.idoProgramId.toBuffer(),
    ]
    const [ticketPublicKey, _] = await PublicKey.findProgramAddress(
      seeds,
      this.idoProgramId,
    )
    return ticketPublicKey.toBase58()
  }

  /**
   * Initialize an IDO
   * @param amount - The number of being-sold tokens in the IDO
   * @param startDate - Start date of IDO
   * @param middleDate - The end of phase #1 and start of phase #2
   * @param endDate -End of the IDO
   * @param soldMintAddress - Mint address for selling
   * @param raisedMintAddress - Mint address for raising
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId` and IDO address `idoAddress`
   */
  initializeIDO = async (
    amount: bigint,
    startdate: bigint,
    middledate: bigint,
    enddate: bigint,
    soldMintAddress: string,
    raisedMintAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    idoAddress: string
  }> => {
    // Validation
    if (!account.isAddress(soldMintAddress))
      throw new Error('Invalid being-sold mint address')
    if (!account.isAddress(raisedMintAddress))
      throw new Error('Invalid be-raised mint address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const ido = await account.createStrictAccount(this.idoProgramId)
    const idoAddress = ido.publicKey.toBase58()
    const srcAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      soldMintAddress,
    )
    // Build public keys
    const soldMintPublicKey = account.fromAddress(soldMintAddress)
    const raisedMintPublicKey = account.fromAddress(raisedMintAddress)
    const srcPublicKey = account.fromAddress(srcAddress)
    // Get treasurer
    const seed = [ido.publicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.idoProgramId,
    )
    const treasurerAddress = treasurerPublicKey.toBase58()
    // Get treasuries
    const soldMintTreasuryPublicKey = account.fromAddress(
      await this._splt.deriveAssociatedAddress(
        treasurerAddress,
        soldMintAddress,
      ),
    )
    const raisedMintTreasuryPublicKey = account.fromAddress(
      await this._splt.deriveAssociatedAddress(
        treasurerAddress,
        raisedMintAddress,
      ),
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
        { key: 'startdate', type: 'i64' },
        { key: 'middledate', type: 'i64' },
        { key: 'enddate', type: 'i64' },
      ],
      { code: 0, amount, startdate, middledate, enddate },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: ido.publicKey, isSigner: true, isWritable: true },
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: soldMintPublicKey, isSigner: false, isWritable: false },
        {
          pubkey: soldMintTreasuryPublicKey,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: raisedMintPublicKey, isSigner: false, isWritable: false },
        {
          pubkey: raisedMintTreasuryPublicKey,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.idoProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    const idoSig = await this.selfSign(transaction, ido)
    this.addSignature(transaction, idoSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, idoAddress }
  }

  /**
   * Initialize a ticket
   * @param idoAddress - IDO address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId` and ticket address `ticketAddress`
   */
  initializeTicket = async (
    idoAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    ticketAddress: string
  }> => {
    // Validation
    if (!account.isAddress(idoAddress)) throw new Error('Invalid ido address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const ticketAddress = await this.deriveTicketAddress(
      payerAddress,
      idoAddress,
    )
    // Build public keys
    const idoPublicKey = account.fromAddress(idoAddress)
    const ticketPublicKey = account.fromAddress(ticketAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 1,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: idoPublicKey, isSigner: false, isWritable: false },
        { pubkey: ticketPublicKey, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: this.idoProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, ticketAddress }
  }

  /**
   * Stake being-raised tokens into the pool
   * (The action must be done during the phase #1 of the IDO only)
   * @param amount - Additional amount
   * @param idoAddress - IDO address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId` and ticket address `ticketAddress`
   */
  stake = async (
    amount: bigint,
    idoAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    ticketAddress: string
  }> => {
    // Validation
    if (!account.isAddress(idoAddress)) throw new Error('Invalid ido address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const ticketAddress = await this.deriveTicketAddress(
      payerAddress,
      idoAddress,
    )
    const { raised_mint_treasury: raisedMintTreasuryAddress } =
      await this.getIDOData(idoAddress)
    const { mint: raisedMintAddress } = await this._splt.getAccountData(
      raisedMintTreasuryAddress,
    )
    const srcAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      raisedMintAddress,
    )
    // Build public keys
    const idoPublicKey = account.fromAddress(idoAddress)
    const ticketPublicKey = account.fromAddress(ticketAddress)
    const srcPublicKey = account.fromAddress(srcAddress)
    const raisedMintPublicKey = account.fromAddress(raisedMintAddress)
    const raisedMintTreasuryPublicKey = account.fromAddress(
      raisedMintTreasuryAddress,
    )
    // Get treasurer
    const seed = [idoPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.idoProgramId,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      {
        code: 2,
        amount,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: idoPublicKey, isSigner: false, isWritable: true },
        { pubkey: ticketPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: raisedMintPublicKey, isSigner: false, isWritable: false },
        {
          pubkey: raisedMintTreasuryPublicKey,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.idoProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, ticketAddress }
  }

  /**
   * Unstake being-raised tokens from the pool
   * (The action must be done during both the phase #1 and #2 of the IDO)
   * @param amount - Subtractive amount
   * @param idoAddress - IDO address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId` and ticket address `ticketAddress`
   */
  unstake = async (
    amount: bigint,
    idoAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    ticketAddress: string
  }> => {
    // Validation
    if (!account.isAddress(idoAddress)) throw new Error('Invalid ido address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const ticketAddress = await this.deriveTicketAddress(
      payerAddress,
      idoAddress,
    )
    const { raised_mint_treasury: raisedMintTreasuryAddress } =
      await this.getIDOData(idoAddress)
    const { mint: raisedMintAddress } = await this._splt.getAccountData(
      raisedMintTreasuryAddress,
    )
    const dstAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      raisedMintAddress,
    )
    // Build public keys
    const idoPublicKey = account.fromAddress(idoAddress)
    const ticketPublicKey = account.fromAddress(ticketAddress)
    const dstPublicKey = account.fromAddress(dstAddress)
    const raisedMintPublicKey = account.fromAddress(raisedMintAddress)
    const raisedMintTreasuryPublicKey = account.fromAddress(
      raisedMintTreasuryAddress,
    )
    // Get treasurer
    const seed = [idoPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.idoProgramId,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      {
        code: 3,
        amount,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: idoPublicKey, isSigner: false, isWritable: true },
        { pubkey: ticketPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: raisedMintPublicKey, isSigner: false, isWritable: false },
        {
          pubkey: raisedMintTreasuryPublicKey,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.idoProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, ticketAddress }
  }

  /**
   * Redeem being-sold tokens from the pool
   * (The action must be done after the IDO ends)
   * @param idoAddress - IDO address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId` and the associated address `dstAddress` that receives the being-sold tokens
   */
  redeem = async (
    idoAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    dstAddress: string
  }> => {
    // Validation
    if (!account.isAddress(idoAddress)) throw new Error('Invalid ido address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const ticketAddress = await this.deriveTicketAddress(
      payerAddress,
      idoAddress,
    )
    const {
      sold_mint_treasury: soldMintTreasuryAddress,
      raised_mint_treasury: raisedMintTreasuryAddress,
    } = await this.getIDOData(idoAddress)
    const { mint: soldMintAddress } = await this._splt.getAccountData(
      soldMintTreasuryAddress,
    )
    const dstAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      soldMintAddress,
    )
    // Build public keys
    const idoPublicKey = account.fromAddress(idoAddress)
    const ticketPublicKey = account.fromAddress(ticketAddress)
    const dstPublicKey = account.fromAddress(dstAddress)
    const soldMintPublicKey = account.fromAddress(soldMintAddress)
    const soldMintTreasuryPublicKey = account.fromAddress(
      soldMintTreasuryAddress,
    )
    const raisedMintTreasuryPublicKey = account.fromAddress(
      raisedMintTreasuryAddress,
    )
    // Get treasurer
    const seed = [idoPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.idoProgramId,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 4,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: idoPublicKey, isSigner: false, isWritable: false },
        { pubkey: ticketPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: soldMintPublicKey, isSigner: false, isWritable: false },
        {
          pubkey: soldMintTreasuryPublicKey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: raisedMintTreasuryPublicKey,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.idoProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, dstAddress }
  }

  /**
   * Seed more being-sold tokens into the pool
   * (The action must be done before the IDO starts)
   * @remarks IDO owner only
   * @param amount - Additional amount
   * @param idoAddress - IDO address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`
   */
  seed = async (
    amount: bigint,
    idoAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
  }> => {
    // Validation
    if (!account.isAddress(idoAddress)) throw new Error('Invalid ido address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const { sold_mint_treasury: soldMintTreasuryAddress } =
      await this.getIDOData(idoAddress)
    const { mint: soldMintAddress } = await this._splt.getAccountData(
      soldMintTreasuryAddress,
    )
    const srcAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      soldMintAddress,
    )
    // Build public keys
    const idoPublicKey = account.fromAddress(idoAddress)
    const soldMintTreasuryPublicKey = account.fromAddress(
      soldMintTreasuryAddress,
    )
    const srcPublicKey = account.fromAddress(srcAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      {
        code: 5,
        amount,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: idoPublicKey, isSigner: false, isWritable: true },
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        {
          pubkey: soldMintTreasuryPublicKey,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.idoProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Unseed less being-sold tokens from the pool
   * (The action must be done before the IDO starts)
   * @remarks IDO owner only
   * @param amount - Subtractive amount
   * @param idoAddress - IDO address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`
   */
  unseed = async (
    amount: bigint,
    idoAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
  }> => {
    // Validation
    if (!account.isAddress(idoAddress)) throw new Error('Invalid ido address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const { sold_mint_treasury: soldMintTreasuryAddress } =
      await this.getIDOData(idoAddress)
    const { mint: soldMintAddress } = await this._splt.getAccountData(
      soldMintTreasuryAddress,
    )
    const dstAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      soldMintAddress,
    )
    // Build public keys
    const idoPublicKey = account.fromAddress(idoAddress)
    const soldMintTreasuryPublicKey = account.fromAddress(
      soldMintTreasuryAddress,
    )
    const dstPublicKey = account.fromAddress(dstAddress)
    // Get treasurer
    const seed = [idoPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.idoProgramId,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      {
        code: 6,
        amount,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: idoPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        {
          pubkey: soldMintTreasuryPublicKey,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.idoProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Collect being-raised tokens from the pool
   * (The action must be done after the IDO ends)
   * @remarks IDO owner only
   * @param amount - The collected amount of being-raised tokens
   * @param idoAddress - IDO address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId` and the associated address `dstAddress` that receives the being-sold tokens
   */
  collect = async (
    amount: bigint,
    idoAddress: string,
    wallet: WalletInterface,
  ): Promise<{
    txId: string
    dstAddress: string
  }> => {
    // Validation
    if (!account.isAddress(idoAddress)) throw new Error('Invalid ido address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Fetch necessary info
    const { raised_mint_treasury: raisedMintTreasuryAddress } =
      await this.getIDOData(idoAddress)
    const { mint: raisedMintAddress } = await this._splt.getAccountData(
      raisedMintTreasuryAddress,
    )
    const dstAddress = await this._splt.deriveAssociatedAddress(
      payerAddress,
      raisedMintAddress,
    )
    // Build public keys
    const idoPublicKey = account.fromAddress(idoAddress)
    const dstPublicKey = account.fromAddress(dstAddress)
    const raisedMintPublicKey = account.fromAddress(raisedMintAddress)
    const raisedMintTreasuryPublicKey = account.fromAddress(
      raisedMintTreasuryAddress,
    )
    // Get treasurer
    const seed = [idoPublicKey.toBuffer()]
    const treasurerPublicKey = await PublicKey.createProgramAddress(
      seed,
      this.idoProgramId,
    )
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      {
        code: 7,
        amount,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: idoPublicKey, isSigner: false, isWritable: false },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: raisedMintPublicKey, isSigner: false, isWritable: false },
        {
          pubkey: raisedMintTreasuryPublicKey,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: treasurerPublicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: this.splataProgramId, isSigner: false, isWritable: false },
      ],
      programId: this.idoProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId, dstAddress }
  }

  /**
   * Transfer ido's ownership
   * @remarks IDO owner only
   * @param idoAddress - IDO address
   * @param newOwnerAddress - New owner address
   * @param wallet - {@link https://descartesnetwork.github.io/sen-js/interfaces/WalletInterface.html | Wallet instance}
   * @returns Transaction hash `txId`
   */
  transferIDOOwnership = async (
    idoAddress: string,
    newOwnerAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(idoAddress)) throw new Error('Invalid IDO address')
    if (!account.isAddress(newOwnerAddress))
      throw new Error('Invalid new owner address')
    const idoPublicKey = account.fromAddress(idoAddress)
    const newOwnerPublicKey = account.fromAddress(newOwnerAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 8,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
        { pubkey: idoPublicKey, isSigner: false, isWritable: true },
        { pubkey: newOwnerPublicKey, isSigner: false, isWritable: false },
      ],
      programId: this.idoProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }
}

export default IDO
