import { SwapCoder } from '../coder/swap/index'
import { Program, Provider } from '@project-serum/anchor'
import { PublicKey } from '@solana/web3.js'

const SWAP_PROGRAM_ID = new PublicKey(
  '4erFSLP7oBFSVC1t35jdxmbfxEhYCKfoM6XdG2BLR3UF',
)

export function program(provider?: Provider): Program<SwapProgram> {
  return new Program<SwapProgram>(IDL, SWAP_PROGRAM_ID, provider, coder())
}

export function coder(): SwapCoder {
  return new SwapCoder(IDL)
}

/**
 * SplToken IDL.
 */
export type SwapProgram = {
  version: '0.1.0'
  name: 'sen_swap'
  instructions: [
    {
      name: 'initializePool'
      accounts: [
        {
          name: 'payerPublicKey'
          isMut: true
          isSigner: true
        },
        {
          name: 'ownerPublicKey'
          isMut: false
          isSigner: false
        },
        {
          name: 'poolPublicKey'
          isMut: true
          isSigner: true
        },
        {
          name: 'lptPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'mintLptPublicKey'
          isMut: true
          isSigner: true
        },
        {
          name: 'taxmanPublicKey'
          isMut: false
          isSigner: false
        },
        {
          name: 'proofPublicKey'
          isMut: false
          isSigner: false
        },
        //
        {
          name: 'srcAPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'mintAPublicKey'
          isMut: false
          isSigner: false
        },
        {
          name: 'treasuryAPublicKey'
          isMut: true
          isSigner: false
        },
        //
        {
          name: 'srcBPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'mintBPublicKey'
          isMut: false
          isSigner: false
        },
        {
          name: 'treasuryBPublicKey'
          isMut: true
          isSigner: false
        },
        //
        {
          name: 'treasurerPublicKey'
          isMut: false
          isSigner: false
        },
        { name: 'systemProgram'; isMut: false; isSigner: false },
        { name: 'spltProgramId'; isMut: false; isSigner: false },
        { name: 'rent'; isMut: false; isSigner: false },
        { name: 'splataProgramId'; isMut: false; isSigner: false },
      ]
      args: [
        {
          name: 'code'
          type: 'u8'
        },
        {
          name: 'delta_a'
          type: 'u64'
        },
        {
          name: 'delta_b'
          type: 'u64'
        },
        {
          name: 'fee_ratio'
          type: 'u64'
        },
        {
          name: 'tax_ratio'
          type: 'u64'
        },
      ]
    },
  ]
  accounts: []
}

export const IDL: SwapProgram = {
  version: '0.1.0',
  name: 'sen_swap',
  instructions: [
    {
      name: 'initializePool',
      accounts: [
        {
          name: 'payerPublicKey',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'ownerPublicKey',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'poolPublicKey',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'lptPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'mintLptPublicKey',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'taxmanPublicKey',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'proofPublicKey',
          isMut: false,
          isSigner: false,
        },
        //
        {
          name: 'srcAPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'mintAPublicKey',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'treasuryAPublicKey',
          isMut: true,
          isSigner: false,
        },
        //
        {
          name: 'srcBPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'mintBPublicKey',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'treasuryBPublicKey',
          isMut: true,
          isSigner: false,
        },
        //
        {
          name: 'treasurerPublicKey',
          isMut: false,
          isSigner: false,
        },
        { name: 'systemProgram', isMut: false, isSigner: false },
        { name: 'spltProgramId', isMut: false, isSigner: false },
        { name: 'rent', isMut: false, isSigner: false },
        { name: 'splataProgramId', isMut: false, isSigner: false },
      ],
      args: [
        {
          name: 'code',
          type: 'u8',
        },
        {
          name: 'delta_a',
          type: 'u64',
        },
        {
          name: 'delta_b',
          type: 'u64',
        },
        {
          name: 'fee_ratio',
          type: 'u64',
        },
        {
          name: 'tax_ratio',
          type: 'u64',
        },
      ],
    },
  ],
  accounts: [],
}
