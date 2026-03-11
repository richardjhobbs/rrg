import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.27',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun',
    },
  },
  networks: {
    baseSepolia: {
      url: 'https://sepolia.base.org',
      chainId: 84532,
      accounts: deployerKey ? [deployerKey] : [],
    },
    base: {
      url: 'https://mainnet.base.org',
      chainId: 8453,
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
  paths: {
    sources: './contracts',
    tests: './contracts/test',
    artifacts: './artifacts',
  },
  etherscan: {
    apiKey: process.env.BASESCAN_API_KEY || '',
  },
};

export default config;
