import { Program, Provider } from '@project-serum/anchor'
import { SwapProgram } from './swapProgram'
import { program as swapProgram } from './swapProgram'

export class SentreProgram {
  public static swap(provider: Provider): Program<SwapProgram> {
    return swapProgram(provider)
  }
}
