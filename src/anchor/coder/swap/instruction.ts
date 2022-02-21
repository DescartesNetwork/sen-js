import { InstructionCode } from './../../../swap/constant'
import { Idl } from '@project-serum/anchor'
import * as BufferLayout from 'buffer-layout'
import camelCase from 'camelcase'

import { InstructionCoder } from '../index'

export class SwapInstructionCoder implements InstructionCoder {
  constructor(_: Idl) {}

  encode(ixName: string, ix: any): Buffer {
    switch (camelCase(ixName)) {
      case 'initializePool': {
        return encodeInitializePool(ix)
      }
      case 'addSidedLiquidity': {
        return encodeAddSidedLiquidity(ix)
      }
      default: {
        throw new Error(`Invalid instruction: ${ixName}`)
      }
    }
  }

  encodeState(_ixName: string, _ix: any): Buffer {
    throw new Error('Swap does not have state')
  }
}

function encodeInitializePool({
  delta_a,
  delta_b,
  fee_ratio,
  tax_ratio,
}: any): Buffer {
  const data = encodeData({
    initializePool: { delta_a, delta_b, fee_ratio, tax_ratio },
  })
  return data
}

function encodeAddSidedLiquidity({ delta_a, delta_b }: any): Buffer {
  const data = encodeData({
    addSidedLiquidity: { delta_a, delta_b },
  })
  return data
}

const LAYOUT = BufferLayout.union(BufferLayout.u8('instruction'))
LAYOUT.addVariant(
  InstructionCode.InitializePool.valueOf(),
  BufferLayout.struct([
    BufferLayout.nu64('delta_a'),
    BufferLayout.nu64('delta_b'),
    BufferLayout.nu64('fee_ratio'),
    BufferLayout.nu64('tax_ratio'),
  ]),
  'initializePool',
)
LAYOUT.addVariant(
  InstructionCode.AddSidedLiquidity.valueOf(),
  BufferLayout.struct([
    BufferLayout.nu64('delta_a'),
    BufferLayout.nu64('delta_b'),
  ]),
  'addSidedLiquidity',
)

function encodeData(instruction: any): Buffer {
  let b = Buffer.alloc(instructionMaxSpan)
  let span = LAYOUT.encode(instruction, b)
  return b.slice(0, span)
}

const instructionMaxSpan = Math.max(
  // @ts-ignore
  ...Object.values(LAYOUT.registry).map((r) => r.span),
)
