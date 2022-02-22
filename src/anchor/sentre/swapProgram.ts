import { SwapCoder } from '../coder/swap/index'
import { Program, Provider } from '@project-serum/anchor'
import { PublicKey } from '@solana/web3.js'

const SWAP_PROGRAM_ID = new PublicKey(
  '4erFSLP7oBFSVC1t35jdxmbfxEhYCKfoM6XdG2BLR3UF',
)

export function program(provider?: Provider): Program<SwapProgram> {
  return new Program<SwapProgram>(SwapIDL, SWAP_PROGRAM_ID, provider, coder())
}

export function coder(): SwapCoder {
  return new SwapCoder(SwapIDL)
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
    {
      name: 'addLiquidity'
      accounts: [
        {
          name: 'payerPublicKey'
          isMut: false
          isSigner: true
        },
        {
          name: 'poolPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'lptPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'mintLPTPublicKey'
          isMut: true
          isSigner: false
        },

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
          name: 'delta_a'
          type: 'u64'
        },
        {
          name: 'delta_b'
          type: 'u64'
        },
      ]
    },
    {
      name: 'addSidedLiquidity'
      accounts: [
        {
          name: 'payerPublicKey'
          isMut: false
          isSigner: true
        },
        {
          name: 'poolPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'lptPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'mintLPTPublicKey'
          isMut: true
          isSigner: false
        },

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

        { name: 'taxmanPublicKey'; isSigner: false; isMut: false },
        { name: 'treasuryTaxmanAPublicKey'; isSigner: false; isMut: true },
        { name: 'treasuryTaxmanBPublicKey'; isSigner: false; isMut: true },
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
          name: 'delta_a'
          type: 'u64'
        },
        {
          name: 'delta_b'
          type: 'u64'
        },
      ]
    },
    {
      name: 'removeLiquidity'
      accounts: [
        {
          name: 'payerPublicKey'
          isMut: false
          isSigner: true
        },
        {
          name: 'poolPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'lptPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'mintLPTPublicKey'
          isMut: true
          isSigner: false
        },

        {
          name: 'dstAPublicKey'
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

        {
          name: 'dstBPublicKey'
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
          name: 'lpt'
          type: 'u64'
        },
      ]
    },
    {
      name: 'wrapSol'
      accounts: [
        {
          name: 'payerPublicKey'
          isMut: true
          isSigner: true
        },
        {
          name: 'accountPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'mintPublicKey'
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
          name: 'amount'
          type: 'u64'
        },
      ]
    },
    {
      name: 'swap'
      accounts: [
        {
          name: 'payerPublicKey'
          isMut: false
          isSigner: true
        },
        {
          name: 'poolPublicKey'
          isMut: true
          isSigner: false
        },

        {
          name: 'srcPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'srcMintPublicKey'
          isMut: false
          isSigner: false
        },
        {
          name: 'treasuryBidPublicKey'
          isMut: true
          isSigner: false
        },

        {
          name: 'dstPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'dstMintPublicKey'
          isMut: false
          isSigner: false
        },
        {
          name: 'treasuryAskPublicKey'
          isMut: true
          isSigner: false
        },

        {
          name: 'taxmanPublicKey'
          isMut: true
          isSigner: false
        },
        {
          name: 'treasuryTaxmanPublicKey'
          isMut: true
          isSigner: false
        },
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
          name: 'amount'
          type: 'u64'
        },
        {
          name: 'limit'
          type: 'u64'
        },
      ]
    },
  ]
  accounts: [
    {
      name: 'pool'
      type: {
        kind: 'struct'
        fields: [
          { name: 'owner'; type: 'publicKey' },
          { name: 'state'; type: 'u8' },
          { name: 'mint_lpt'; type: 'publicKey' },
          { name: 'taxman'; type: 'publicKey' },

          { name: 'mint_a'; type: 'publicKey' },
          { name: 'treasury_a'; type: 'publicKey' },
          { name: 'reserve_a'; type: 'u64' },

          { name: 'mint_b'; type: 'publicKey' },
          { name: 'treasury_b'; type: 'publicKey' },
          { name: 'reserve_b'; type: 'u64' },

          { name: 'fee_ratio'; type: 'u64' },
          { name: 'tax_ratio'; type: 'u64' },
        ]
      }
    },
  ]
}

export const SwapIDL: SwapProgram = {
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
    {
      name: 'addLiquidity',
      accounts: [
        {
          name: 'payerPublicKey',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'poolPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'lptPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'mintLPTPublicKey',
          isMut: true,
          isSigner: false,
        },

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
          name: 'delta_a',
          type: 'u64',
        },
        {
          name: 'delta_b',
          type: 'u64',
        },
      ],
    },
    {
      name: 'addSidedLiquidity',
      accounts: [
        {
          name: 'payerPublicKey',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'poolPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'lptPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'mintLPTPublicKey',
          isMut: true,
          isSigner: false,
        },

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
        { name: 'taxmanPublicKey', isSigner: false, isMut: false },
        { name: 'treasuryTaxmanAPublicKey', isSigner: false, isMut: true },
        { name: 'treasuryTaxmanBPublicKey', isSigner: false, isMut: true },
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
          name: 'delta_a',
          type: 'u64',
        },
        {
          name: 'delta_b',
          type: 'u64',
        },
      ],
    },
    {
      name: 'removeLiquidity',
      accounts: [
        {
          name: 'payerPublicKey',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'poolPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'lptPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'mintLPTPublicKey',
          isMut: true,
          isSigner: false,
        },

        {
          name: 'dstAPublicKey',
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

        {
          name: 'dstBPublicKey',
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
          name: 'lpt',
          type: 'u64',
        },
      ],
    },
    {
      name: 'wrapSol',
      accounts: [
        {
          name: 'payerPublicKey',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'accountPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'mintPublicKey',
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
          name: 'amount',
          type: 'u64',
        },
      ],
    },
    {
      name: 'swap',
      accounts: [
        {
          name: 'payerPublicKey',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'poolPublicKey',
          isMut: true,
          isSigner: false,
        },

        {
          name: 'srcPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'srcMintPublicKey',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'treasuryBidPublicKey',
          isMut: true,
          isSigner: false,
        },

        {
          name: 'dstPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'dstMintPublicKey',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'treasuryAskPublicKey',
          isMut: true,
          isSigner: false,
        },

        {
          name: 'taxmanPublicKey',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'treasuryTaxmanPublicKey',
          isMut: true,
          isSigner: false,
        },
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
          name: 'amount',
          type: 'u64',
        },
        {
          name: 'limit',
          type: 'u64',
        },
      ],
    },
  ],
  accounts: [
    {
      name: 'pool',
      type: {
        kind: 'struct',
        fields: [
          { name: 'owner', type: 'publicKey' },
          { name: 'state', type: 'u8' },
          { name: 'mint_lpt', type: 'publicKey' },
          { name: 'taxman', type: 'publicKey' },

          { name: 'mint_a', type: 'publicKey' },
          { name: 'treasury_a', type: 'publicKey' },
          { name: 'reserve_a', type: 'u64' },

          { name: 'mint_b', type: 'publicKey' },
          { name: 'treasury_b', type: 'publicKey' },
          { name: 'reserve_b', type: 'u64' },

          { name: 'fee_ratio', type: 'u64' },
          { name: 'tax_ratio', type: 'u64' },
        ],
      },
    },
  ],
}
