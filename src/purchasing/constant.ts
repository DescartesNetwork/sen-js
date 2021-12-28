export enum InstructionCode {
  InitializeRetailer,
  FreezeRetailer,
  ThawRetailer,
  PlaceOrder,
  CancelOrder,
  RedeemOrder,
  ApproveOrder,
  RejectOrder
}

export const ErrorMapping = [
  'Invalid instruction',
  'Invalid owner',
  'Invalid approver',
  'Incorrect program id',
  'Operation overflowed',
  'Already constructed',
  'Cannot input a zero amount',
  'Order state is not active to action',
  'Order is not approved',
  'Cannot operate a pool with two same mints',
  'Invalid input data',
  'Invalid input data, bid mint is not matching',
  'Invalid input data, ask mint is not matching',
  'Invalid input data, source bid account is not matching',
  'Invalid input data, source ask account is not matching',
  'Locked time is not open',
]