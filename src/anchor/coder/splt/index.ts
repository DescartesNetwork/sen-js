import { Idl } from '@project-serum/anchor'
import { SplTokenAccountsCoder } from '@project-serum/anchor/dist/cjs/coder/spl-token/accounts'
import { SplTokenEventsCoder } from '@project-serum/anchor/dist/cjs/coder/spl-token/events'
import { SplTokenStateCoder } from '@project-serum/anchor/dist/cjs/coder/spl-token/state'
import { Coder } from '../index.js'
import { SplTokenInstructionCoder } from './instruction'

/**
 * Coder for the SPL token program.
 */
export class SplTokenCoder implements Coder {
  readonly instruction: SplTokenInstructionCoder
  readonly accounts: SplTokenAccountsCoder
  readonly state: SplTokenStateCoder
  readonly events: SplTokenEventsCoder

  constructor(idl: Idl) {
    this.instruction = new SplTokenInstructionCoder(idl)
    this.accounts = new SplTokenAccountsCoder(idl)
    this.events = new SplTokenEventsCoder(idl)
    this.state = new SplTokenStateCoder(idl)
  }
}
