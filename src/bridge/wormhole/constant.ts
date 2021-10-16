export enum ClusterName {
  DevNet = 'devnet',
  TestNet = 'testnet',
  MainNet = 'mainnet'
}

export type Cluster = ClusterName.DevNet | ClusterName.TestNet | ClusterName.MainNet;

/**
 * SOL_BRIDGE_ADDRESS
 * @param cluster
 */
export const getSolBridgeAddress = (cluster: Cluster) => {
  return cluster === ClusterName.MainNet
    ? 'worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth'
    : ClusterName.TestNet
      ? 'Brdguy7BmNB4qwEbcqqMbyV5CyJd2sxQNUn6NEpMSsUb'
      : 'Bridge1p5gheXUvJ6jGWGeCsgPKgnE3YgdGKRVCMY9o'
}

/**
 * SOL_TOKEN_BRIDGE_ADDRESS
 * @param cluster
 */
export const getSolTokenBridgeAddress = (cluster: Cluster) => {
  return cluster === ClusterName.MainNet
    ? 'wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb'
    : cluster === ClusterName.TestNet
      ? 'A4Us8EhCC76XdGAN17L4KpRNEK423nMivVHZzZqFqqBg'
      : 'B6RHG3mfcckmrYN1UhmJzyS1XX3fZKbkeUcpJe9Sy3FE'
}

/**
 * WORMHOLE_RPC_HOSTS
 * @param cluster
 */
export const getWormHoleRpcHosts = (cluster: string) => {
  return cluster === ClusterName.MainNet
    ? [
      'https://wormhole-v2-mainnet-api.certus.one',
      'https://wormhole.inotel.ro',
      'https://wormhole-v2-mainnet-api.mcf.rocks',
      'https://wormhole-v2-mainnet-api.chainlayer.network',
    ]
    : cluster === ClusterName.TestNet
      ? [
        'https://wormhole-v2-testnet-api.certus.one',
        'https://wormhole-v2-testnet-api.mcf.rocks',
        'https://wormhole-v2-testnet-api.chainlayer.network',
      ]
      : ['http://localhost:7071']
}

/**
 * ETH_TOKEN_BRIDGE_ADDRESS
 * @param cluster
 */
export const getETHTokenBridgeAddress = (cluster: string) => {
  return cluster === 'mainnet'
    ? '0x3ee18B2214AFF97000D974cf647E7C347E8fa585'
    : cluster === 'testnet'
      ? '0xa6CDAddA6e4B6704705b065E01E52e2486c0FBf6'
      : '0x0290FB167208Af455bB137780163b7B7a9a10C16'
}