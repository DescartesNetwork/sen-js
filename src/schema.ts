import { BN } from '@project-serum/anchor'

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
  taxman: string
  mint_a: string
  treasury_a: string
  reserve_a: BN
  mint_b: string
  treasury_b: string
  reserve_b: BN
  fee_ratio: BN
  tax_ratio: BN
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

export type IDOData = {
  owner: string
  startdate: bigint
  middledate: bigint
  enddate: bigint
  redeemdate: bigint
  total_sold: bigint
  total_raised: bigint
  sold_mint_treasury: string
  raised_mint_treasury: string
  is_initialized: boolean
}

export type TicketData = {
  owner: string
  ido: string
  amount: bigint
  is_initialized: boolean
}

export type StakeDebtData = {
  farm: string
  owner: string
  shares: bigint
  reward_per_share: bigint
  created_at: bigint
  updated_at: bigint
  is_initialized: boolean
}

export type StakeFarmData = {
  owner: string
  state: number
  mint_stake: string
  treasury_stake: string
  mint_reward: string
  treasury_reward: string
  reward_per_share: bigint
  period: bigint
  scope: bigint
}

export type OrderData = {
  owner: string
  state: number
  retailer: string
  bid_amount: bigint
  ask_amount: bigint
  locked_time: bigint
  created_at: bigint
  updated_at: bigint
}

export type RetailerData = {
  owner: string
  state: number
  mint_bid: string
  treasury_bid: string
  mint_ask: string
  treasury_ask: string
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
    { key: 'taxman', type: 'pub' },

    { key: 'mint_a', type: 'pub' },
    { key: 'treasury_a', type: 'pub' },
    { key: 'reserve_a', type: 'u64' },

    { key: 'mint_b', type: 'pub' },
    { key: 'treasury_b', type: 'pub' },
    { key: 'reserve_b', type: 'u64' },

    { key: 'fee_ratio', type: 'u64' },
    { key: 'tax_ratio', type: 'u64' },
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

  /**
   * IDO
   */
  IDO_SCHEMA: [
    { key: 'owner', type: 'pub' },
    { key: 'startdate', type: 'i64' },
    { key: 'middledate', type: 'i64' },
    { key: 'enddate', type: 'i64' },
    { key: 'redeemdate', type: 'i64' },
    { key: 'total_sold', type: 'u64' },
    { key: 'total_raised', type: 'u64' },
    { key: 'sold_mint_treasury', type: 'pub' },
    { key: 'raised_mint_treasury', type: 'pub' },
    { key: 'is_initialized', type: 'bool' },
  ],
  TICKET_SCHEMA: [
    { key: 'owner', type: 'pub' },
    { key: 'ido', type: 'pub' },
    { key: 'amount', type: 'u64' },
    { key: 'is_initialized', type: 'bool' },
  ],

  /**
   * Stake
   */
  STAKE_DEBT_SCHEMA: [
    { key: 'farm', type: 'pub' },
    { key: 'owner', type: 'pub' },
    { key: 'shares', type: 'u64' },
    { key: 'reward_per_share', type: 'u64' },
    { key: 'created_at', type: 'i64' },
    { key: 'updated_at', type: 'i64' },
    { key: 'is_initialized', type: 'bool' },
  ],
  STAKE_FARM_STATE: {
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
  STAKE_FARM_SCHEMA: [
    { key: 'owner', type: 'pub' },
    { key: 'state', type: 'u8' },
    { key: 'mint_stake', type: 'pub' },
    { key: 'treasury_stake', type: 'pub' },
    { key: 'mint_reward', type: 'pub' },
    { key: 'treasury_reward', type: 'pub' },
    { key: 'reward_per_share', type: 'u64' },
    { key: 'period', type: 'u64' },
    { key: 'scope', type: 'u64' },
  ],
  ORDER_SCHEMA: [
    { key: 'owner', type: 'pub' },
    { key: 'state', type: 'u8' },
    { key: 'retailer', type: 'pub' },
    { key: 'bid_amount', type: 'u64' },
    { key: 'ask_amount', type: 'u64' },
    { key: 'locked_time', type: 'i64' },
    { key: 'created_at', type: 'i64' },
    { key: 'updated_at', type: 'i64' },
  ],
  RETAILER_SCHEMA: [
    { key: 'owner', type: 'pub' },
    { key: 'state', type: 'u8' },
    { key: 'mint_bid', type: 'pub' },
    { key: 'treasury_bid', type: 'pub' },
    { key: 'mint_ask', type: 'pub' },
    { key: 'treasury_ask', type: 'pub' },
  ],
}

export default schema
