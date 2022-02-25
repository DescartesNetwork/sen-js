import { TypeDef } from '@project-serum/anchor/dist/cjs/program/namespace/types'
import {
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  PublicKey,
  KeyedAccountInfo,
  GetProgramAccountsFilter,
  Keypair,
} from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMultisigInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

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
import { program as splTokenProgram } from '@project-serum/anchor/dist/cjs/spl/token'
import {
  getAnchorProvider,
  getRawAnchorProvider,
} from './anchor/sentre/anchorProvider'
import { web3, BN } from '@project-serum/anchor'
import { SplToken } from '@project-serum/anchor/dist/cjs/spl/token'

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

// const splProgram = Spl.token()
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

  async getSplProgram(wallet: WalletInterface) {
    const anchorProvider = await getAnchorProvider(this.connection, wallet)
    return splTokenProgram(anchorProvider)
  }

  getRawSplProgram() {
    const anchorProvider = getRawAnchorProvider(this.connection)
    return splTokenProgram(anchorProvider)
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

  convertMintData = (
    mintData: TypeDef<SplToken['accounts']['0'], SplToken>,
  ): MintData => {
    const { mintAuthority, decimals, freezeAuthority, isInitialized, supply } =
      mintData
    return {
      mint_authority: (mintAuthority as PublicKey).toBase58(),
      supply,
      decimals,
      is_initialized: isInitialized,
      freeze_authority: (freezeAuthority as PublicKey).toBase58(),
    }
  }
  /**
   * Get mint data
   * @param mintAddress
   * @returns
   */
  getMintData = async (mintAddress: string): Promise<MintData> => {
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    const mintPublicKey = account.fromAddress(mintAddress)
    const sptProgram = this.getRawSplProgram()
    const mintData = await (sptProgram.account as any).mint.fetch(mintPublicKey)
    return this.convertMintData(mintData)
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
    const anchorProvider = await getAnchorProvider(this.connection, wallet)
    const spltProgram = splTokenProgram(anchorProvider)
    freezeAuthorityAddress = freezeAuthorityAddress || DEFAULT_EMPTY_ADDRESS
    // Validation
    if (!account.isAddress(mintAuthorityAddress))
      throw new Error('Invalid mint authority address')
    if (!account.isAddress(freezeAuthorityAddress))
      throw new Error('Invalid freeze authority address')

    const ix = await (spltProgram.account as any).mint.createInstruction(mint)
    const tx = new web3.Transaction().add(ix)
    await anchorProvider.send(tx, [mint])

    const txIds = await spltProgram.rpc.initializeMint(
      decimals,
      account.fromAddress(mintAuthorityAddress),
      account.fromAddress(mintAuthorityAddress),
      {
        accounts: {
          mint: mint.publicKey,
          rent: web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [],
      },
    )
    return { txId: txIds }
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
  ): Promise<{ accountAddress: string; txId: string }> => {
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    if (!account.isAddress(ownerAddress))
      throw new Error('Invalid owner address')
    const mintPublicKey = account.fromAddress(mintAddress)
    const ownerPublicKey = account.fromAddress(ownerAddress)
    // Generate the associated account address
    const accountAddress = await this.deriveAssociatedAddress(
      ownerAddress,
      mintAddress,
    )
    const accountPublicKey = account.fromAddress(accountAddress)
    // Build tx
    const splProgram = await this.getSplProgram(wallet)
    const instruction = createAssociatedTokenAccountInstruction(
      splProgram.provider.wallet.publicKey,
      accountPublicKey,
      ownerPublicKey,
      mintPublicKey,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    let transaction = new web3.Transaction().add(instruction)
    const txId = await splProgram.provider.send(transaction)
    return { accountAddress, txId }
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
    // Rent multisig
    const multiSigSpace = new soproxABI.struct(schema.MULTISIG_SCHEMA).space
    await this.rentAccount(wallet, multiSig, multiSigSpace, this.spltProgramId)
    // Build tx
    const spltProgram = await this.getSplProgram(wallet)
    const instruction = createInitializeMultisigInstruction(
      multiSig.publicKey,
      signerAddresses.map((addr) => account.fromAddress(addr)),
      minimumSig,
    )
    const transaction = new web3.Transaction().add(instruction)
    const txId = await spltProgram.provider.send(transaction, [])
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
    amount: BN,
    srcAddress: string,
    dstAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    // Build tx
    const spltProgram = await this.getSplProgram(wallet)
    const txId = await spltProgram.rpc.transfer(amount, {
      accounts: {
        authority: spltProgram.provider.wallet.publicKey,
        source: srcAddress,
        destination: dstAddress,
      },
    })
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
    amount: BN,
    srcAddress: string,
    delegateAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(delegateAddress))
      throw new Error('Invalid delegate address')
    // Build tx
    const spltProgram = await this.getSplProgram(wallet)
    const txId = await spltProgram.rpc.approve(amount, {
      accounts: {
        authority: spltProgram.provider.wallet.publicKey,
        source: srcAddress,
        delegate: delegateAddress,
      },
    })
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
    // Build tx
    const spltProgram = await this.getSplProgram(wallet)
    const txId = await spltProgram.rpc.revoke({
      accounts: {
        authority: spltProgram.provider.wallet.publicKey,
        source: srcAddress,
      },
    })
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
    const payerSig = await wallet.rawSignTransaction(transaction)
    this.addSignature(transaction, payerSig)
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
    amount: BN,
    mintAddress: string,
    dstAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    if (!account.isAddress(dstAddress))
      throw new Error('Invalid destination address')
    const mintPublicKey = account.fromAddress(mintAddress)
    const dstPublicKey = account.fromAddress(dstAddress)

    // Build tx
    const splProgram = await this.getSplProgram(wallet)
    const txId = await splProgram.rpc.mintTo(amount, {
      accounts: {
        mint: mintPublicKey,
        to: dstPublicKey,
        authority: splProgram.provider.wallet.publicKey,
      },
      signers: [],
    })

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
    amount: BN,
    srcAddress: string,
    mintAddress: string,
    wallet: WalletInterface,
  ): Promise<{ txId: string }> => {
    if (!account.isAddress(srcAddress))
      throw new Error('Invalid source address')
    if (!account.isAddress(mintAddress)) throw new Error('Invalid mint address')
    const srcPublicKey = account.fromAddress(srcAddress)
    const mintPublicKey = account.fromAddress(mintAddress)
    // Build tx
    const splProgram = await this.getSplProgram(wallet)
    const txId = await splProgram.rpc.burn(amount, {
      accounts: {
        source: srcPublicKey,
        mint: mintPublicKey,
        authority: splProgram.provider.wallet.publicKey,
      },
      signers: [],
    })

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
    // Build tx
    const splProgram = await this.getSplProgram(wallet)
    const txId = await splProgram.rpc.closeAccount({
      accounts: {
        account: targetAddress,
        destination: splProgram.provider.wallet.publicKey,
        authority: splProgram.provider.wallet.publicKey,
      },
    })
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
    const splProgram = await this.getSplProgram(wallet)
    const txId = await splProgram.rpc.freezeAccount({
      accounts: {
        account: targetPublicKey,
        mint: mintPublicKey,
        authority: payerPublicKey,
      },
    })
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
    const splProgram = await this.getSplProgram(wallet)
    const txId = await splProgram.rpc.thawAccount({
      accounts: {
        account: targetPublicKey,
        mint: mintPublicKey,
        authority: payerPublicKey,
      },
    })
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
    // Call wrap
    await this._lamports.transfer(lamports, accountAddress, wallet)
    const { txId } = await this.initializeAccount(
      DEFAULT_WSOL,
      ownerAddress,
      wallet,
    )
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
