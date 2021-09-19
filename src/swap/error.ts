export class ProgramError {
  static InvalidAddressErr = new Error('Invalid pool address')
  static InvalidTaxmanAddressErr = new Error('Invalid taxman address')
  static InvalidSourceMintAddressErr = new Error('Invalid source mint address')
  static InvalidDestinationMintAddressErr = new Error('Invalid destination mint address')
}