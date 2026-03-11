/**
 * lib/rrg/erc8004.ts
 * ERC-8004 Trustless Agents — Identity & Reputation Registry integration.
 *
 * Both registries are deployed at the same addresses across 30+ chains,
 * including Base mainnet. We use the Base mainnet deployment so the
 * platform wallet (which already holds Base ETH for RRG gas) can sign
 * all ERC-8004 transactions without needing a separate network.
 *
 * Identity Registry:  0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 * Reputation Registry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 * DrHobbs Agent ID:   17666
 */

import { ethers } from 'ethers';

// ── Constants ─────────────────────────────────────────────────────────────

const IDENTITY_REGISTRY_ADDR  = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const REPUTATION_REGISTRY_ADDR = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

export const DRHOBBS_AGENT_ID   = 17666n;
const AGENT_ENDPOINT            = 'https://richard-hobbs.com/mcp';
const AGENT_URI                 = 'https://richard-hobbs.com/agent.json';
const SITE_URL                  = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realrealgenuine.com').replace(/\/$/, '');

// ── Minimal ABIs ──────────────────────────────────────────────────────────

const IDENTITY_ABI = [
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function setAgentURI(uint256 agentId, string calldata newURI) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
] as const;

// ABI confirmed from deployed contract bytecode (EIP-1967 proxy impl 0x16e0fa7f...):
// selector 0x3c036a7e — int128 (not int256), string tags (not bytes32)
const REPUTATION_ABI = [
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string calldata endpoint, string calldata feedbackURI, bytes32 feedbackHash) external',
] as const;

// ── Provider / Signer (Base mainnet) ─────────────────────────────────────

function getBaseMainnetProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(
    process.env.NEXT_PUBLIC_BASE_RPC_URL ?? 'https://mainnet.base.org'
  );
}

function getPlatformSigner(): ethers.Wallet {
  return new ethers.Wallet(
    process.env.DEPLOYER_PRIVATE_KEY!,
    getBaseMainnetProvider()
  );
}

// ── Identity Registry ─────────────────────────────────────────────────────

/** Read the current tokenURI for a DrHobbs agent ID. */
export async function getAgentUri(agentId = DRHOBBS_AGENT_ID): Promise<string> {
  const provider = getBaseMainnetProvider();
  const contract = new ethers.Contract(IDENTITY_REGISTRY_ADDR, IDENTITY_ABI, provider);
  return contract.tokenURI(agentId) as Promise<string>;
}

/**
 * Update the on-chain tokenURI for the DrHobbs agent identity token.
 * Must be called by the NFT owner (= platform/agent wallet).
 * Returns the tx hash.
 */
export async function updateAgentUri(
  newUri = AGENT_URI,
  agentId = DRHOBBS_AGENT_ID,
): Promise<string> {
  const signer   = getPlatformSigner();
  const contract = new ethers.Contract(IDENTITY_REGISTRY_ADDR, IDENTITY_ABI, signer);
  const tx       = await (contract.setAgentURI as (id: bigint, uri: string) => Promise<ethers.ContractTransactionResponse>)(agentId, newUri);
  const receipt  = await tx.wait(1);
  return receipt!.hash;
}

// ── Reputation Registry ───────────────────────────────────────────────────

export interface ReputationSignalParams {
  agentId?:    bigint;   // defaults to DRHOBBS_AGENT_ID
  buyerWallet: string;   // logged in feedbackURI for traceability
  priceUsdc:   string;   // e.g. "1.00"
  tokenId:     number;   // RRG drop token ID → feedbackURI links to drop page
  txHash:      string;   // purchase tx hash → becomes feedbackHash
}

/**
 * Post a verified-purchase reputation signal to the ERC-8004 Reputation Registry
 * on Base mainnet. Called fire-and-forget after a confirmed RRG sale.
 *
 * NOTE: msg.sender here is the platform wallet, which is also the registered
 * agentWallet for DrHobbs. This means the platform is attesting to the
 * transaction on behalf of the marketplace rather than the buyer submitting
 * direct feedback. The feedbackHash ties the signal to the on-chain purchase tx.
 *
 * Returns the tx hash of the reputation signal.
 */
export async function postReputationSignal(p: ReputationSignalParams): Promise<string> {
  const agentId = p.agentId ?? DRHOBBS_AGENT_ID;
  const signer  = getPlatformSigner();
  const contract = new ethers.Contract(REPUTATION_REGISTRY_ADDR, REPUTATION_ABI, signer);

  // 5-star rating (value=5, no decimals)
  const value         = 5n;
  const valueDecimals = 0;

  // Tag the signal as an RRG purchase (plain strings — not bytes32)
  const tag1 = 'purchase';
  const tag2 = 'rrg';

  // Link to the drop page (provides human-readable evidence)
  const feedbackURI = `${SITE_URL}/rrg/drop/${p.tokenId}`;

  // Hash of the purchase tx hash → ties this reputation signal to the on-chain sale
  const feedbackHash = p.txHash.startsWith('0x') && p.txHash.length === 66
    ? ethers.keccak256(ethers.toUtf8Bytes(p.txHash))
    : ethers.ZeroHash;

  const tx = await (contract.giveFeedback as (
    agentId:      bigint,
    value:        bigint,
    valueDecimals: number,
    tag1:          string,
    tag2:          string,
    endpoint:      string,
    feedbackURI:   string,
    feedbackHash:  string,
  ) => Promise<ethers.ContractTransactionResponse>)(
    agentId,
    value,
    valueDecimals,
    tag1,
    tag2,
    AGENT_ENDPOINT,
    feedbackURI,
    feedbackHash,
  );

  const receipt = await tx.wait(1);
  return receipt!.hash;
}

// ── Public fire-and-forget wrapper ────────────────────────────────────────

/**
 * Non-blocking wrapper — call after a confirmed purchase.
 * Posts a reputation signal to the ERC-8004 Reputation Registry on Base mainnet.
 */
export function fireReputationSignal(
  params: Omit<ReputationSignalParams, 'agentId'>,
): void {
  postReputationSignal(params).then((hash) => {
    console.log('[erc8004] reputation signal posted:', hash);
  }).catch((err) => {
    console.error('[erc8004] reputation signal failed:', err);
  });
}
