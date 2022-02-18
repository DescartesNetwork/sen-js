import { Idl } from '@project-serum/anchor'
import { IdlTypeDef } from '@project-serum/anchor/dist/cjs/idl'
import * as BufferLayout from 'buffer-layout'

import { publicKey, uint64, coption, bool } from '../buffer-layout'
import { AccountsCoder } from '../index'
import { accountSize } from '../common'

const POOL_DATA_SIZE = 257
export class SwapAccountsCoder<A extends string = string>
  implements AccountsCoder
{
  constructor(private idl: Idl) {}

  public async encode<T = any>(accountName: A, account: T): Promise<Buffer> {
    switch (accountName) {
      case 'pool': {
        const buffer = Buffer.alloc(POOL_DATA_SIZE)
        const len = POOL_ACCOUNT_LAYOUT.encode(account, buffer)
        return buffer.slice(0, len)
      }
      default: {
        throw new Error(`Invalid account name: ${accountName}`)
      }
    }
  }

  public decode<T = any>(accountName: A, ix: Buffer): T {
    return this.decodeUnchecked(accountName, ix)
  }

  public decodeUnchecked<T = any>(accountName: A, ix: Buffer): T {
    switch (accountName) {
      case 'pool': {
        return decodePoolAccount(ix)
      }
      default: {
        throw new Error(`Invalid account name: ${accountName}`)
      }
    }
  }

  // TODO: this won't use the appendData.
  public memcmp(accountName: A, _appendData?: Buffer): any {
    switch (accountName) {
      case 'pool': {
        return {
          dataSize: POOL_DATA_SIZE,
        }
      }
      default: {
        throw new Error(`Invalid account name: ${accountName}`)
      }
    }
  }

  public size(idlAccount: IdlTypeDef): number {
    return accountSize(this.idl, idlAccount) ?? 0
  }
}

function decodePoolAccount<T = any>(ix: Buffer): T {
  return POOL_ACCOUNT_LAYOUT.decode(ix) as T
}

const POOL_ACCOUNT_LAYOUT = BufferLayout.struct([
  publicKey('owner'),
  BufferLayout.u8('state'),
  publicKey('mint_lpt'),
  publicKey('taxman'),

  publicKey('mint_a'),
  publicKey('treasury_a'),
  uint64('reserve_a'),

  publicKey('mint_b'),
  publicKey('treasury_b'),
  uint64('reserve_b'),

  uint64('fee_ratio'),
  uint64('tax_ratio'),
])
