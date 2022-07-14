import {
  Transaction,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  PublicKey,
  KeyedAccountInfo,
  GetProgramAccountsFilter,
  Keypair,
} from '@solana/web3.js'

import Tx from './core/tx'
import account from './account'
import schema, { AccountData, MintData, MultisigData } from './schema'
import Lamports from './lamports'
import {
  DEFAULT_SPLT_PROGRAM_ADDRESS,
  DEFAULT_SPLATA_PROGRAM_ADDRESS,
  DEFAULT_EMPTY_ADDRESS,
  DEFAULT_WSOL,
} from './default'
import { WalletInterface } from './rawWallet'

const soproxABI = require('soprox-abi')

const AuthorityType = {
  get MintTokens() {
    return 0
  },
  get FreezeAccount() {
    return 1
  },
  get AccountOwner() {
    return 2
  },
  get CloseAccount() {
    return 3
  },
}

export type SPLTAccountChangeInfo = {
  type: 'account' | 'mint' | 'multisig'
  address: string
  data: Buffer
}

const ErrorMapping = [
  'Lamport balance below rent-exempt threshold',
  'Insufficient funds',
  'Invalid Mint',
  'Account not associated with this Mint',
  'Operation overflowed',
  'Owner does not match',
  'Fixed supply',
  'Already in use',
  'Invalid number of provided signers',
  'Invalid number of required signers',
  'State is unititialized',
  'Instruction does not support native tokens',
  'Non-native account can only be closed if its balance is zero',
  'Invalid instruction',
  'State is invalid for requested operation',
  'Operation overflowed',
  'Account does not support specified authority type',
  'This token mint cannot freeze accounts',
  'Account is frozen',
  'The provided decimals value different from the Mint decimals',
  'Instruction does not support non-native tokens',
]

class SPLT extends Tx {
  spltProgramId: PublicKey
  splataProgramId: PublicKey
  private _lamports: Lamports
  static AuthorityType = AuthorityType

  constructor(
    spltProgramAddress = DEFAULT_SPLT_PROGRAM_ADDRESS,
    splataProgramAddress = DEFAULT_SPLATA_PROGRAM_ADDRESS,
    nodeUrl: string,
  ) {
    super(nodeUrl, ErrorMapping)

    if (!account.isAddress(spltProgramAddress))
      throw new Error('Invalid SPL token program address')
    if (!account.isAddress(splataProgramAddress))
      throw new Error('Invalid SPL associated token program address')
    this.spltProgramId = account.fromAddress(spltProgramAddress)
    this.splataProgramId = account.fromAddress(splataProgramAddress)

    this._lamports = new Lamports(nodeUrl)
  }

  /**
   * Derive associated account of wallet address for a mint address
   * @param walletAddress
   * @param mintAddress
   * @returns An associated address
   */
  deriveAssociatedAddress = async (
    walletAddress: string,
    mintAddress: string,
  ): Promise<string> => {
    return await account.deriveAssociatedAddress(
      walletAddress,
      mintAddress,
      this.spltProgramId.toBase58(),
      this.splataProgramId.toBase58(),
    )
  }

  /**
   * Watch account changes
   * @param callback
   * @param filters
   * @returns Watch id
   */
  watch = (
    callback: (
      error: string | null,
      data:
        | (Omit<SPLTAccountChangeInfo, 'data'> & {
            data: AccountData | MintData | MultisigData
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
      const accountSpace = new soproxABI.struct(schema.ACCOUNT_SCHEMA).space
      const mintSpace = new soproxABI.struct(schema.MINT_SCHEMA).space
      const multisigSpace = new soproxABI.struct(schema.MULTISIG_SCHEMA).space
      let type = null
      let data = {}
      if (buf.length === accountSpace) {
        type = 'account'
        data = this.parseAccountData(buf)
      }
      if (buf.length === mintSpace) {
        type = 'mint'
        data = this.parseMintData(buf)
      }
      if (buf.length === multisigSpace) {
        type = 'multisig'
        data = this.parseMultiSigData(buf)
      }
      if (!type) return callback('Unmatched type', null)
      return callback(null, {
        type: type as SPLTAccountChangeInfo['type'],
        address,
        data: data as AccountData | MintData | MultisigData,
      })
    }
    return this.connection.onProgramAccountChange(
      this.spltProgramId,
      cb,
      'confirmed',
      filters,
    )
  }

  /**
   * Unwatch a watcher by watch id
   * @param watchId
   * @returns
   */
  unwatch = async (watchId: number): Promise<void> => {
    if (!watchId) return
    return await this.connection.removeProgramAccountChangeListener(watchId)
  }

  /**
   * Parse mint buffer data
   * @param data
   * @returns
   */
  parseMintData = (data: Buffer): MintData => {
    const layout = new soproxABI.struct(schema.MINT_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get mint data
   * @param mintAddress
   * @returns
   */
  getMintData = async (mintAddress: string): Promise<MintData> => {
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    const mintPublicKey = account.fromAddress(mintAddress)
    const { data } = (await this.connection.getAccountInfo(mintPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${mintAddress}`)
    return this.parseMintData(data)
  }

  /**
   * Parse account buffer data
   * @param data
   * @returns
   */
  parseAccountData = (data: Buffer): AccountData => {
    const layout = new soproxABI.struct(schema.ACCOUNT_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get account data
   * @param accountAddress
   * @returns
   */
  getAccountData = async (accountAddress: string): Promise<AccountData> => {
    if (!account.isAddress(accountAddress))
      throw new Error('Invalid account address')
    const accountPublicKey = account.fromAddress(accountAddress)
    const { data } =
      (await this.connection.getAccountInfo(accountPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${accountAddress}`)
    return this.parseAccountData(data)
  }

  /**
   * Parse multisig buffer data
   * @param data
   * @returns
   */
  parseMultiSigData = (data: Buffer): MultisigData => {
    const layout = new soproxABI.struct(schema.MULTISIG_SCHEMA)
    if (data.length !== layout.space) throw new Error('Unmatched buffer length')
    layout.fromBuffer(data)
    return layout.value
  }

  /**
   * Get multisig data
   * @param multiSigAddress
   * @returns
   */
  getMultiSigData = async (multiSigAddress: string): Promise<MultisigData> => {
    if (!account.isAddress(multiSigAddress))
      throw new Error('Invalid multiSig address')
    const multiSigPublicKey = account.fromAddress(multiSigAddress)
    const { data } =
      (await this.connection.getAccountInfo(multiSigPublicKey)) || {}
    if (!data) throw new Error(`Cannot read data of ${multiSigAddress}`)
    return this.parseMultiSigData(data)
  }

  /**
   * Initiliza a new token
   * @param decimals
   * @param mintAuthorityAddress
   * @param freezeAuthorityAddress (optional) the one who can freeze accounts
   * @param mint
   * @param wallet
   * @returns Transaction id
   */
  initializeMint = async (
    decimals: number,
    mintAuthorityAddress: string,
    freezeAuthorityAddress: string | null,
    mint: Keypair,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    freezeAuthorityAddress = freezeAuthorityAddress || DEFAULT_EMPTY_ADDRESS
    // Validation
    if (!account.isAddress(mintAuthorityAddress))
      throw new Error('Invalid mint authority address')
    if (!account.isAddress(freezeAuthorityAddress))
      throw new Error('Invalid freeze authority address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Rent mint
    const mintSpace = new soproxABI.struct(schema.MINT_SCHEMA).space
    await this.rentAccount(wallet, mint, mintSpace, this.spltProgramId)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'decimals', type: 'u8' },
        { key: 'mint_authority', type: 'pub' },
        { key: 'freeze_authority_option', type: 'u8' },
        { key: 'freeze_authority', type: 'pub' },
      ],
      {
        code: 0,
        decimals,
        mint_authority: mintAuthorityAddress,
        freeze_authority_option:
          freezeAuthorityAddress === DEFAULT_EMPTY_ADDRESS ? 0 : 1,
        freeze_authority: freezeAuthorityAddress,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: mint.publicKey, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: this.spltProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Initilize an new account of a token
   * @param mintAddress
   * @param ownerAddress
   * @param wallet
   * @returns The new account address and transaction id
   */
  initializeAccount = async (
    mintAddress: string,
    ownerAddress: string,
    wallet: WalletInterface,
    onlyInstruction: boolean = false,
  ): Promise<{
    accountAddress: string
    txId: string
    instruction: TransactionInstruction
  }> => {
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    const mintPublicKey = account.fromAddress(mintAddress)
    const ownerPublicKey = account.fromAddress(ownerAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Generate the associated account address
    const accountAddress = await this.deriveAssociatedAddress(
      ownerAddress,
      mintAddress,
    )
    const accountPublicKey = account.fromAddress(accountAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: payerPublicKey, isSigner: true, isWritable: true },
        { pubkey: accountPublicKey, isSigner: false, isWritable: true },
        { pubkey: ownerPublicKey, isSigner: false, isWritable: false },
        { pubkey: mintPublicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: this.spltProgramId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: this.splataProgramId,
      data: Buffer.from([]),
    })

    if (onlyInstruction) return { accountAddress, txId: '', instruction }
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { accountAddress, txId, instruction }
  }

  /**
   * Initialize a multisig account (No testing yet)
   * @param minimumSig The minimum signers for a consensus
   * @param signerAddresses List of signers
   * @param multiSig Multisign account
   * @param wallet
   * @returns Transaction id
   */
  initializeMultiSig = async (
    minimumSig: number,
    signerAddresses: string[],
    multiSig: Keypair,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!signerAddresses || !signerAddresses.length)
      throw new Error('Empty array of signer addresses')
    for (let signerAddress of signerAddresses)
      if (!account.isAddress(signerAddress))
        throw new Error('Invalid signer address')
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Rent multisig
    const multiSigSpace = new soproxABI.struct(schema.MULTISIG_SCHEMA).space
    await this.rentAccount(wallet, multiSig, multiSigSpace, this.spltProgramId)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'm', type: 'u8' },
      ],
      { code: 2, m: minimumSig },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: multiSig.publicKey, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ...signerAddresses.map((signerAddress) => ({
          pubkey: account.fromAddress(signerAddress),
          isSigner: false,
          isWritable: false,
        })),
      ],
      programId: this.spltProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Send tokens
   * @param amount The decimalized amount
   * @param srcAddress The sender address
   * @param dstAddress The receiver address
   * @param wallet
   * @returns Transaction id
   */
  transfer = async (
    amount: bigint,
    srcAddress: string,
    dstAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    const srcPublicKey = account.fromAddress(srcAddress)
    const dstPublicKey = account.fromAddress(dstAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: 3, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
      ],
      programId: this.spltProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Authorize a person can use your token
   * @param amount The decimalized amount
   * @param srcAddress The source address
   * @param delegateAddress The delegate address
   * @param wallet
   * @returns
   */
  approve = async (
    amount: bigint,
    srcAddress: string,
    delegateAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(delegateAddress))
      throw new Error('Invalid delegate address')
    const srcPublicKey = account.fromAddress(srcAddress)
    const delegatePublicKey = account.fromAddress(delegateAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: 4, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: delegatePublicKey, isSigner: false, isWritable: true },
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
      ],
      programId: this.spltProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Revoke an authorization of token usage
   * @param srcAddress The source address
   * @param wallet
   * @returns
   */
  revoke = async (
    srcAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    const srcPublicKey = account.fromAddress(srcAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 5,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
      ],
      programId: this.spltProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Set authority (onwing, closing) to an account
   * @param authorityType 2 for Owning Authority, 3 for Closing Authority
   * @param newAuthorityAddress The new authority address
   * @param targetAddress The target account address
   * @param wallet
   * @returns
   */
  setAuthority = async (
    authorityType: number,
    newAuthorityAddress: string,
    targetAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    newAuthorityAddress = newAuthorityAddress || DEFAULT_EMPTY_ADDRESS
    if (!account.isAddress(newAuthorityAddress))
      throw new Error('Invalid new authority address')
    if (!account.isAddress(targetAddress))
      throw new Error('Invalid target address')
    const targetPublicKey = account.fromAddress(targetAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'authority_type', type: 'u8' },
        { key: 'new_authority_option', type: 'u8' },
        { key: 'new_authority', type: 'pub' },
      ],
      {
        code: 6,
        authority_type: authorityType,
        new_authority_option:
          newAuthorityAddress === DEFAULT_EMPTY_ADDRESS ? 0 : 1,
        new_authority: newAuthorityAddress,
      },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: targetPublicKey, isSigner: false, isWritable: true },
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
      ],
      programId: this.spltProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Mint more tokens
   * @param amount The decimalized minted amount
   * @param mintAddress The mint address
   * @param dstAddress
   * @param wallet
   * @returns
   */
  mintTo = async (
    amount: bigint,
    mintAddress: string,
    dstAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    const mintPublicKey = account.fromAddress(mintAddress)
    const dstPublicKey = account.fromAddress(dstAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: 7, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: mintPublicKey, isSigner: false, isWritable: true },
        { pubkey: dstPublicKey, isSigner: false, isWritable: true },
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
      ],
      programId: this.spltProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Burn tokens
   * @param amount The decimalized amount
   * @param srcAddress The token source address to burn
   * @param mintAddress The mint address
   * @param wallet
   * @returns
   */
  burn = async (
    amount: bigint,
    srcAddress: string,
    mintAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    const srcPublicKey = account.fromAddress(srcAddress)
    const mintPublicKey = account.fromAddress(mintAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct(
      [
        { key: 'code', type: 'u8' },
        { key: 'amount', type: 'u64' },
      ],
      { code: 8, amount },
    )
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: srcPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintPublicKey, isSigner: false, isWritable: true },
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
      ],
      programId: this.spltProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Close an account
   * @param targetAddress The target account address
   * @param wallet
   * @returns
   */
  closeAccount = async (
    targetAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(targetAddress))
      throw new Error('Invalid target address')
    const targetPublicKey = account.fromAddress(targetAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 9,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: targetPublicKey, isSigner: false, isWritable: true },
        { pubkey: payerPublicKey, isSigner: false, isWritable: true },
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
      ],
      programId: this.spltProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Freeze an account
   * @param targetAddress The target account address
   * @param mintAddress The mint address
   * @param wallet
   * @returns
   */
  freezeAccount = async (
    targetAddress: string,
    mintAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(targetAddress))
      throw new Error('Invalid target address')
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    const targetPublicKey = account.fromAddress(targetAddress)
    const mintPublicKey = account.fromAddress(mintAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 10,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: targetPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintPublicKey, isSigner: false, isWritable: false },
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
      ],
      programId: this.spltProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Thaw an account
   * @param targetAddress The target account address
   * @param mintAddress The mint address
   * @param wallet
   * @returns
   */
  thawAccount = async (
    targetAddress: string,
    mintAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(targetAddress))
      throw new Error('Invalid target address')
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    const targetPublicKey = account.fromAddress(targetAddress)
    const mintPublicKey = account.fromAddress(mintAddress)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)
    // Build tx
    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    const layout = new soproxABI.struct([{ key: 'code', type: 'u8' }], {
      code: 11,
    })
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: targetPublicKey, isSigner: false, isWritable: true },
        { pubkey: mintPublicKey, isSigner: false, isWritable: false },
        { pubkey: payerPublicKey, isSigner: true, isWritable: false },
      ],
      programId: this.spltProgramId,
      data: layout.toBuffer(),
    })
    transaction.add(instruction)
    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { txId }
  }

  /**
   * Wrap SOL
   * @param lamports The amount of wrapped lamports
   * @param ownerAddress The owner for the wrapped lamports
   * @param wallet
   * @returns
   */
  wrap = async (
    lamports: bigint | number,
    ownerAddress: string,
    wallet: WalletInterface,
  ): Promise<{ accountAddress: string; txId: string }> => {
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    // Generate the associated account address
    const accountAddress = await this.deriveAssociatedAddress(
      ownerAddress,
      DEFAULT_WSOL,
    )
    // Validate space
    const accountSpace = new soproxABI.struct(schema.ACCOUNT_SCHEMA).space
    const requiredLamports =
      await this.connection.getMinimumBalanceForRentExemption(accountSpace)
    if (requiredLamports > Number(lamports))
      throw new Error(`At least ${requiredLamports} is required`)

    let transaction = new Transaction()
    transaction = await this.addRecentCommitment(transaction)
    // Create transfer instruction
    const { instruction: transferInstruction } = await this._lamports.transfer(
      lamports,
      accountAddress,
      wallet,
      true,
    )
    transaction.add(transferInstruction)
    //Create initialize instruction
    const { instruction: initializeInstruction } = await this.initializeAccount(
      DEFAULT_WSOL,
      ownerAddress,
      wallet,
      true,
    )
    transaction.add(initializeInstruction)
    // Get payer
    const payerAddress = await wallet.getAddress()
    const payerPublicKey = account.fromAddress(payerAddress)

    transaction.feePayer = payerPublicKey
    // Sign tx
    transaction = await wallet.signTransaction(transaction)
    // Send tx
    const txId = await this.sendTransaction(transaction)
    return { accountAddress, txId }
  }

  /**
   * Unwrap WSOL
   * @param wallet
   * @returns
   */
  unwrap = async (wallet: WalletInterface): Promise<{ txId: string }> => {
    // Generate the associated account address
    const ownerAddress = await wallet.getAddress()
    const accountAddress = await this.deriveAssociatedAddress(
      ownerAddress,
      DEFAULT_WSOL,
    )
    return await this.closeAccount(accountAddress, wallet)
  }
}

export default SPLT
