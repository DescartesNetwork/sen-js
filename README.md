# SEN JS


## Introduction
This library is to help developers can integrate their projects to Sentre Ecosystem easily.

Sentre is an open liquidity protocol built on Solana. It's aiming to build and open, friendly, and free environment for both DApps developers, and DeFi users.

[![Npm package version](https://badgen.net/npm/v/@senswap/sen-js)](https://www.npmjs.com/package/@senswap/sen-js)
[![Npm package monthly downloads](https://badgen.net/npm/dm/@senswap/sen-js)](https://www.npmjs.com/package/@senswap/sen-js)
[![GitHub license](https://badgen.net/npm/license/@senswap/sen-js)](https://github.com/DescartesNetwork/sen-js/blob/master/LICENSE)


## Installation

```
npm i @senswap/sen-js
```

## Usage

```ts
import { Swap } from '@senswap/sen-js'
// Or
// const { Swap } = require('@senswap/sen-js')

const swapProgramAddress = '4erFSLP7oBFSVC1t35jdxmbfxEhYCKfoM6XdG2BLR3UF'
const spltProgramAddress = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const splataProgramAddress = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
const nodeUrl = 'https://api.devnet.solana.com'
const swap = new Swap(
  swapProgramAddress,
  spltProgramAddress,
  splataProgramAddress,
  nodeUrl
)

// Should be placed in an async wrapper
const poolData = await swap.getPoolData('9NodRcEmSxg2KMtPnFfzSvXGbBFXkRA4zgejhSGVpt9F')
console.log(poolData)
// {
//   owner: "8UaZw2jDhJzv5V53569JbCd3bD4BnyCfBH3sjwgajGS9"
//   state: 1
//   mint_lpt: "EsPTPmXhwpp5XjzCms6juqgrGCAhsTEaC47Lvm29RwTF"
//   taxman: "8UaZw2jDhJzv5V53569JbCd3bD4BnyCfBH3sjwgajGS9"
//   mint_a: "5YwUkPdXLoujGkZuo9B4LsLKj3hdkDcfP4derpspifSJ"
//   treasury_a: "J9aSEQkAF3Umy6mipq9EppLLrKWS26q5m4HaV2KG8atv"
//   reserve_a: 3110702644000n
//   mint_b: "27hdcZv7RtuMp75vupThR3T4KLsL61t476eosMdoec4c"
//   treasury_b: "9s2NgRPn4f7X6Kng4x8JEDcZ9kwphFg1kPD4oLQFEbM7"
//   reserve_b: 4570811590939n
//   fee_ratio: 2500000n
//   tax_ratio: 0n
// }
```

## Related works

### Soprox ABI

* https://www.npmjs.com/package/soprox-abi
* https://soprox.descartes.network/development/soproxabi

### SenHub

* https://docs.sentre.io/