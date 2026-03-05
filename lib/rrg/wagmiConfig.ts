import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'viem/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

const isTestnet = process.env.NEXT_PUBLIC_CHAIN_ID === '84532';

export const targetChain    = isTestnet ? baseSepolia : base;
export const targetChainId  = targetChain.id;

export const wagmiConfig = createConfig({
  chains: [baseSepolia, base],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'RRG — richard-hobbs.com' }),
  ],
  transports: {
    [baseSepolia.id]: http('https://sepolia.base.org'),
    [base.id]:        http('https://mainnet.base.org'),
  },
  ssr: true,
});
