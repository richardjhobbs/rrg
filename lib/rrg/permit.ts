/**
 * EIP-2612 permit helpers
 *
 * The purchase flow:
 * 1. Server returns permit payload (domain, types, value) to frontend
 * 2. Frontend calls signTypedData via wagmi — buyer signs off-chain
 * 3. Frontend POSTs signature to /api/rrg/confirm
 * 4. Server calls mintWithPermit(tokenId, buyer, deadline, v, r, s)
 * 5. Contract executes permit + split + mint atomically
 */

import { ethers } from 'ethers';

// USDC on Base uses name "USD Coin" and version "2"
export const USDC_PERMIT_NAME    = 'USD Coin';
export const USDC_PERMIT_VERSION = '2';

// USDC on Base Sepolia uses different name
export const USDC_TESTNET_PERMIT_NAME    = 'USD Coin';
export const USDC_TESTNET_PERMIT_VERSION = '2';

export const PERMIT_TYPES = {
  Permit: [
    { name: 'owner',   type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value',   type: 'uint256' },
    { name: 'nonce',   type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface PermitPayload {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: typeof PERMIT_TYPES;
  value: {
    owner: string;
    spender: string;
    value: string;       // bigint as string (6dp USDC)
    nonce: string;       // bigint as string
    deadline: string;    // bigint as string
  };
  priceUsdc6dp: string;  // for display
  tokenId: number;
}

// ── Minimal USDC ABI for nonce check ──────────────────────────────────
const USDC_NONCE_ABI = [
  'function nonces(address owner) external view returns (uint256)',
] as const;

export async function buildPermitPayload(
  buyerWallet: string,
  tokenId: number,
  priceUsdc6dp: bigint,
  testnet = false
): Promise<PermitPayload> {
  const chainId = testnet ? 84532 : 8453;
  const usdcAddress = testnet
    ? process.env.NEXT_PUBLIC_USDC_CONTRACT_TESTNET!
    : process.env.NEXT_PUBLIC_USDC_CONTRACT_MAINNET!;
  const rrgAddress = process.env.NEXT_PUBLIC_RRG_CONTRACT_ADDRESS!;
  const rpcUrl = testnet
    ? process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL!
    : process.env.NEXT_PUBLIC_BASE_RPC_URL!;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const usdc     = new ethers.Contract(usdcAddress, USDC_NONCE_ABI, provider);
  const nonce    = await usdc.nonces(buyerWallet);

  // 10-minute deadline from now
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  return {
    domain: {
      name:              testnet ? USDC_TESTNET_PERMIT_NAME : USDC_PERMIT_NAME,
      version:           testnet ? USDC_TESTNET_PERMIT_VERSION : USDC_PERMIT_VERSION,
      chainId,
      verifyingContract: usdcAddress,
    },
    types: PERMIT_TYPES,
    value: {
      owner:    buyerWallet,
      spender:  rrgAddress,
      value:    priceUsdc6dp.toString(),
      nonce:    nonce.toString(),
      deadline: deadline.toString(),
    },
    priceUsdc6dp: priceUsdc6dp.toString(),
    tokenId,
  };
}

// ── Parse a hex signature string into v, r, s ─────────────────────────
export function splitSignature(sig: string): { v: number; r: string; s: string } {
  const { v, r, s } = ethers.Signature.from(sig);
  return { v, r, s };
}
