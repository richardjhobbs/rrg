import { ethers } from 'ethers';

// ── ABI (minimal — only functions we call server-side) ─────────────────
export const RRG_ABI = [
  'function registerDrop(uint256 tokenId, address creator, uint256 priceUsdc6dp, uint256 maxSupply) external',
  'function mintWithPermit(uint256 tokenId, address buyer, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
  'function getDrop(uint256 tokenId) external view returns (tuple(address creator, uint256 priceUsdc, uint256 maxSupply, uint256 minted, bool active))',
  'function pauseDrop(uint256 tokenId) external',
  'function unpauseDrop(uint256 tokenId) external',
  'function setTokenURI(uint256 tokenId, string calldata tokenUri) external',
  'function operatorMint(uint256 tokenId, address buyer) external',
  'event Minted(uint256 indexed tokenId, address indexed buyer, uint256 creatorShare, uint256 platformShare)',
  'event OperatorMinted(uint256 indexed tokenId, address indexed buyer)',
  'event DropRegistered(uint256 indexed tokenId, address indexed creator, uint256 priceUsdc, uint256 maxSupply)',
] as const;

// ── ERC-1155 balance check ─────────────────────────────────────────────
export const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
] as const;

// ── Helpers (Base mainnet) ─────────────────────────────────────────────

export function getRpcProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_BASE_RPC_URL!);
}

export function getDeployerSigner(): ethers.Wallet {
  return new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, getRpcProvider());
}

export function getRRGContract(): ethers.Contract {
  return new ethers.Contract(
    process.env.NEXT_PUBLIC_RRG_CONTRACT_ADDRESS!,
    RRG_ABI,
    getDeployerSigner()
  );
}

export function getRRGReadOnly(): ethers.Contract {
  return new ethers.Contract(
    process.env.NEXT_PUBLIC_RRG_CONTRACT_ADDRESS!,
    RRG_ABI,
    getRpcProvider()
  );
}

// ── Convert USDC decimal (number) → 6dp bigint ────────────────────────
export function toUsdc6dp(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

// ── Convert 6dp bigint → human-readable number ────────────────────────
export function fromUsdc6dp(amount: bigint): number {
  return Number(amount) / 1_000_000;
}

// ── Verify a wallet holds at least 1 of a tokenId ─────────────────────
export async function verifyOwnership(
  wallet: string,
  tokenId: number,
): Promise<boolean> {
  const contract = new ethers.Contract(
    process.env.NEXT_PUBLIC_RRG_CONTRACT_ADDRESS!,
    ERC1155_ABI,
    getRpcProvider()
  );
  const balance = await contract.balanceOf(wallet, tokenId);
  return balance > 0n;
}
