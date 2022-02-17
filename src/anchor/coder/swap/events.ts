import { Event } from '@project-serum/anchor'
import { IdlEvent } from '@project-serum/anchor/dist/cjs/idl'
import { Idl } from '@project-serum/anchor'

import { EventCoder } from '../index'

export class SwapEventsCoder implements EventCoder {
  constructor(_idl: Idl) {}

  decode<E extends IdlEvent = IdlEvent, T = Record<string, string>>(
    _log: string,
  ): Event<E, T> | null {
    throw new Error('SPL token program does not have events')
  }
}
