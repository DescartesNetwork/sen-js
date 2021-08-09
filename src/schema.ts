export type MintData = {
  mint_authority_option: number
  mint_authority: string
  supply: bigint
  decimals: number
  is_initialized: boolean
  freeze_authority_option: number
  freeze_authority: string
}

export type AccountData = {
  mint: string
  owner: string
  amount: bigint
  delegate_option: number
  delegate: string
  state: number
  is_native_option: number
  is_native: bigint
  delegated_amount: bigint
  close_authority_option: number
  close_authority: string
}

export type MultisigData = {
  m: number
  n: number
  is_initialized: boolean
  signers: string[]
}

export type PoolData = {
  owner: string
  state: number
  mint_lpt: string
  vault: string
  mint_s: string
  treasury_s: string
  reserve_s: bigint
  mint_a: string
  treasury_a: string
  reserve_a: bigint
  mint_b: string
  treasury_b: string
  reserve_b: bigint
}

export type DebtData = {
  stake_pool: string
  owner: string
  account: string
  debt: bigint
  is_initialized: boolean
}

export type StakePoolData = {
  owner: string
  state: number
  genesis_timestamp: bigint
  total_shares: bigint
  mint_share: string
  mint_token: string
  treasury_token: string
  reward: bigint
  period: bigint
  compensation: bigint
  treasury_sen: string
}

const schema = {
  /**
   * Swap
   */
  POOL_STATE: {
    get Uninitialized() {
      return 0
    },
    get Initialized() {
      return 1
    },
    get Frozen() {
      return 2
    },
  },
  POOL_SCHEMA: [
    { key: 'owner', type: 'pub' },
    { key: 'state', type: 'u8' },
    { key: 'mint_lpt', type: 'pub' },
    { key: 'vault', type: 'pub' },

    { key: 'mint_s', type: 'pub' },
    { key: 'treasury_s', type: 'pub' },
    { key: 'reserve_s', type: 'u64' },

    { key: 'mint_a', type: 'pub' },
    { key: 'treasury_a', type: 'pub' },
    { key: 'reserve_a', type: 'u64' },

    { key: 'mint_b', type: 'pub' },
    { key: 'treasury_b', type: 'pub' },
    { key: 'reserve_b', type: 'u64' },
  ],

  /**
   * Farming
   */
  DEBT_SCHEMA: [
    { key: 'stake_pool', type: 'pub' },
    { key: 'owner', type: 'pub' },
    { key: 'account', type: 'pub' },
    { key: 'debt', type: 'u128' },
    { key: 'is_initialized', type: 'bool' },
  ],
  STAKE_POOL_STATE: {
    get Uninitialized() {
      return 0
    },
    get Initialized() {
      return 1
    },
    get Frozen() {
      return 2
    },
  },
  STAKE_POOL_SCHEMA: [
    { key: 'owner', type: 'pub' },
    { key: 'state', type: 'u8' },
    { key: 'genesis_timestamp', type: 'i64' },

    { key: 'total_shares', type: 'u64' },
    { key: 'mint_share', type: 'pub' },

    { key: 'mint_token', type: 'pub' },
    { key: 'treasury_token', type: 'pub' },

    { key: 'reward', type: 'u64' },
    { key: 'period', type: 'u64' },
    { key: 'compensation', type: 'i128' },
    { key: 'treasury_sen', type: 'pub' },
  ],

  /**
   * SPL Token
   */
  MINT_SCHEMA: [
    { key: 'mint_authority_option', type: 'u32' },
    { key: 'mint_authority', type: 'pub' },
    { key: 'supply', type: 'u64' },
    { key: 'decimals', type: 'u8' },
    { key: 'is_initialized', type: 'bool' },
    { key: 'freeze_authority_option', type: 'u32' },
    { key: 'freeze_authority', type: 'pub' },
  ],
  ACCOUNT_STATE: {
    get Uninitialized() {
      return 0
    },
    get Initialized() {
      return 1
    },
    get Frozen() {
      return 2
    },
  },
  ACCOUNT_SCHEMA: [
    { key: 'mint', type: 'pub' },
    { key: 'owner', type: 'pub' },
    { key: 'amount', type: 'u64' },
    { key: 'delegate_option', type: 'u32' },
    { key: 'delegate', type: 'pub' },
    { key: 'state', type: 'u8' },
    { key: 'is_native_option', type: 'u32' },
    { key: 'is_native', type: 'u64' },
    { key: 'delegated_amount', type: 'u64' },
    { key: 'close_authority_option', type: 'u32' },
    { key: 'close_authority', type: 'pub' },
  ],
  MULTISIG_SCHEMA: [
    { key: 'm', type: 'u8' },
    { key: 'n', type: 'u8' },
    { key: 'is_initialized', type: 'bool' },
    { key: 'signers', type: '[pub;11]' },
  ],
}

export default schema
