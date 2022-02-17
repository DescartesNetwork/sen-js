import { Program } from '@project-serum/anchor'
import { SwapProgram } from './swapProgram'
import { program as swapProgram } from './swapProgram'

export class SentreProgram {
  public static swap(): Program<SwapProgram> {
    return swapProgram()
  }
}
