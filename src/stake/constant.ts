export enum InstructionCode {
  InitializeFarm = 0,
  Stake = 1,
  Harvest = 2,
  Unstake = 3,
  Freeze = 4,
  Thaw = 5,
  Seed = 6,
  Unseed = 7,
  TransferFarmOwnership = 8,
}

export const ErrorMapping = [
  'Invalid instruction',
  'Invalid owner',
  'Incorrect program id',
  'Operation overflowed',
  'Already constructed',
  'Zero value',
  'Farm unmatched',
  'Farm frozen',
]
