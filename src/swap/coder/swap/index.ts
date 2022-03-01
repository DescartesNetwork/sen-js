import { Idl } from '@project-serum/anchor'

import { Coder } from '../index'
import { SwapInstructionCoder } from './instruction'
import { SwapStateCoder } from './state'
import { SwapAccountsCoder } from './accounts'
import { SwapEventsCoder } from './events'

/**
 * Coder for the SPL token program.
 */
export class SwapCoder implements Coder {
  readonly instruction: SwapInstructionCoder
  readonly accounts: SwapAccountsCoder
  readonly state: SwapStateCoder
  readonly events: SwapEventsCoder

  constructor(idl: Idl) {
    this.instruction = new SwapInstructionCoder(idl)
    this.accounts = new SwapAccountsCoder(idl)
    this.events = new SwapEventsCoder(idl)
    this.state = new SwapStateCoder(idl)
  }
}
