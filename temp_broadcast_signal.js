// Broadcast DEPLOYER → DrHobbs ERC-8004 reputation signal
// Uses DEPLOYER_PRIVATE_KEY from rrg .env.local
const fs   = require('fs');
const path = require('path');

// Read DEPLOYER_PRIVATE_KEY from .env.local
const envPath = '/home/agent/apps/rrg/.env.local';
const envContents = fs.readFileSync(envPath, 'utf8');
const pkMatch = envContents.match(/^DEPLOYER_PRIVATE_KEY=(.+)$/m);
if (!pkMatch) { console.error('DEPLOYER_PRIVATE_KEY not found in .env.local'); process.exit(1); }
const DEPLOYER_PRIVATE_KEY = pkMatch[1].trim();

const { ethers } = require('/home/agent/agents/drhobbs-8004/mcp-server/node_modules/ethers');
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const signer   = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);

const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';
// Calldata from get_feedback_tx (DEPLOYER rating DrHobbs #17666)
const calldata = '0x3c036a7e00000000000000000000000000000000000000000000000000000000000045020000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0c33f8bf6d79cee7b01aaa490524673b26cf63971d0eb51183a69f6d17ea2a15d0000000000000000000000000000000000000000000000000000000000000008707572636861736500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000037272670000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001d68747470733a2f2f726963686172642d686f6262732e636f6d2f6d637000000000000000000000000000000000000000000000000000000000000000000000af68747470733a2f2f726963686172642d686f6262732e636f6d2f6170692f7272672f7369676e616c3f746f3d31373636362674783d30786461633431383165383466343338643538356537383465383730666138306161653133336330616437356266626463636433613231663537383937636363656626746f6b656e3d312666726f6d3d3078333639643034663038663234353435343932366163393661303136346136333466643934363630620000000000000000000000000000000000';

async function main() {
  const bal = await provider.getBalance(signer.address);
  console.log('DEPLOYER address:', signer.address);
  console.log('DEPLOYER ETH balance:', ethers.formatEther(bal), 'ETH');

  // Estimate gas first
  try {
    const gasEst = await provider.estimateGas({ to: REPUTATION_REGISTRY, data: calldata, from: signer.address });
    console.log('Gas estimate:', gasEst.toString());
  } catch (e) {
    console.error('Gas estimation failed:', e.message);
    process.exit(1);
  }

  // Send transaction
  const tx = await signer.sendTransaction({ to: REPUTATION_REGISTRY, data: calldata, value: 0n });
  console.log('TX hash:', tx.hash);
  const receipt = await tx.wait();
  console.log('TX confirmed in block:', receipt.blockNumber);
  console.log('Gas used:', receipt.gasUsed.toString());
  console.log('Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
}
main().catch(console.error);
