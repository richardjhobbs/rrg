/**
 * ERC-8004 Trustless Agents — Identity & Reputation Registry integration.
 * Adapted from rrg/lib/rrg/erc8004.ts
 *
 * Identity Registry:  0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 * Reputation Registry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 */

import { ethers } from 'ethers';
import { getBaseProvider, getPlatformSigner } from './contract';

// ── Constants ────────────────────────────────────────────────────────

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realrealgenuine.com'
).replace(/\/$/, '');

// ── ABIs ─────────────────────────────────────────────────────────────

const IDENTITY_ABI = [
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function setAgentURI(uint256 agentId, string calldata newURI) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'function register(string calldata agentURI) external returns (uint256)',
] as const;

const REPUTATION_ABI = [
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string calldata endpoint, string calldata feedbackURI, bytes32 feedbackHash) external',
] as const;

// ── Identity Registry ────────────────────────────────────────────────

function getIdentityContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(
    IDENTITY_REGISTRY,
    IDENTITY_ABI,
    signerOrProvider ?? getBaseProvider()
  );
}

function getReputationContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(
    REPUTATION_REGISTRY,
    REPUTATION_ABI,
    signerOrProvider ?? getBaseProvider()
  );
}

/** Read the tokenURI for an agent ID. */
export async function getAgentUri(agentId: bigint): Promise<string> {
  const contract = getIdentityContract();
  return contract.tokenURI(agentId) as Promise<string>;
}

/** Check if a wallet has an ERC-8004 identity token. */
export async function getAgentIdForWallet(
  walletAddress: string
): Promise<bigint | null> {
  const contract = getIdentityContract();
  const balance: bigint = await contract.balanceOf(walletAddress);
  if (balance === 0n) return null;
  const tokenId: bigint = await contract.tokenOfOwnerByIndex(walletAddress, 0n);
  return tokenId;
}

/** Register a new agent identity. Returns the new token ID and tx hash. */
export async function registerAgentIdentity(
  agentId: string,
  agentName: string,
  walletAddress: string,
  tier: string
): Promise<{ tokenId: bigint; txHash: string }> {
  const agentUri = JSON.stringify({
    name: agentName,
    description: `Shopping agent on VIA (${tier})`,
    agentWallet: walletAddress,
    endpoint: `${SITE_URL}/api/agent/${agentId}/mcp`,
    protocols: ['x402', 'erc8004', 'mcp'],
    capabilities: tier === 'pro'
      ? ['browse', 'evaluate', 'recommend', 'bid', 'purchase']
      : ['bid', 'purchase'],
    platform: 'VIA Agent Drop System',
    tier,
  });

  const signer = getPlatformSigner();
  const contract = getIdentityContract(signer);

  const tx = await contract.register(agentUri);
  const receipt = await tx.wait();

  // Parse the Transfer event to get the minted token ID
  const transferEvent = receipt.logs.find(
    (log: ethers.Log) =>
      log.topics[0] === ethers.id('Transfer(address,address,uint256)')
  );

  let tokenId = 0n;
  if (transferEvent && transferEvent.topics[3]) {
    tokenId = BigInt(transferEvent.topics[3]);
  }

  return { tokenId, txHash: receipt.hash };
}

/** Post a reputation feedback signal for an agent. */
export async function postReputationSignal(
  agentId: bigint,
  value: number,
  tag1: string,
  tag2: string,
  feedbackUri: string
): Promise<string> {
  const signer = getPlatformSigner();
  const contract = getReputationContract(signer);

  const feedbackHash = ethers.keccak256(ethers.toUtf8Bytes(feedbackUri));

  const tx = await contract.giveFeedback(
    agentId,
    value,
    2, // 2 decimal places
    tag1,
    tag2,
    `${SITE_URL}/api/agent/${agentId}/mcp`,
    feedbackUri,
    feedbackHash
  );

  const receipt = await tx.wait();
  return receipt.hash;
}
