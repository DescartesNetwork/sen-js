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
  farm: string
  owner: string
  shares: bigint
  debt: bigint
  is_initialized: boolean
}

export type FarmData = {
  owner: string
  state: number
  mint_stake: string
  treasury_stake: string
  mint_reward: string
  treasury_reward: string
  genesis_timestamp: bigint
  total_shares: bigint
  reward: bigint
  period: bigint
  compensation: bigint
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
    { key: 'farm', type: 'pub' },
    { key: 'owner', type: 'pub' },
    { key: 'shares', type: 'u64' },
    { key: 'debt', type: 'u128' },
    { key: 'is_initialized', type: 'bool' },
  ],
  FARM_STATE: {
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
  FARM_SCHEMA: [
    { key: 'owner', type: 'pub' },
    { key: 'state', type: 'u8' },
    { key: 'mint_stake', type: 'pub' },
    { key: 'treasury_stake', type: 'pub' },
    { key: 'mint_reward', type: 'pub' },
    { key: 'treasury_reward', type: 'pub' },
    { key: 'genesis_timestamp', type: 'i64' },
    { key: 'total_shares', type: 'u64' },
    { key: 'reward', type: 'u64' },
    { key: 'period', type: 'u64' },
    { key: 'compensation', type: 'i128' },
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
