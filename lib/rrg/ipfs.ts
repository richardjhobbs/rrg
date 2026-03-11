/**
 * IPFS upload via Pinata
 *
 * Only used AFTER a successful mint, for the low-res JPEG (max 800px longest side)
 * plus an ERC-1155 metadata JSON.
 * Never for original files, never before mint confirmation.
 */

import sharp from 'sharp';
import { downloadFile } from './storage';
import { db } from './db';
import { getRRGContract } from './contract';

const PINATA_URL      = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

// ── Resize a JPEG buffer to max 800px longest side ────────────────────
export async function resizeForIpfs(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer)
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// ── Upload a buffer to IPFS via Pinata ────────────────────────────────
export async function uploadToIpfs(
  buffer: Buffer,
  filename: string,
  metadata?: Record<string, string>
): Promise<{ cid: string; url: string }> {
  const formData = new FormData();

  const blob = new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' });
  formData.append('file', blob, filename);

  if (metadata) {
    formData.append(
      'pinataMetadata',
      JSON.stringify({ name: filename, keyvalues: metadata })
    );
  }

  formData.append(
    'pinataOptions',
    JSON.stringify({ cidVersion: 1 })
  );

  const res = await fetch(PINATA_URL, {
    method: 'POST',
    headers: {
      pinata_api_key:        process.env.PINATA_API_KEY!,
      pinata_secret_api_key: process.env.PINATA_SECRET_KEY!,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata upload failed: ${res.status} ${text}`);
  }

  const json = await res.json() as { IpfsHash: string };
  const cid  = json.IpfsHash;

  return {
    cid,
    url: `https://gateway.pinata.cloud/ipfs/${cid}`,
  };
}

// ── Upload a JSON object to IPFS via Pinata ───────────────────────────
export async function uploadJsonToIpfs(
  jsonBody: Record<string, unknown>,
  name: string
): Promise<{ cid: string; url: string }> {
  const res = await fetch(PINATA_JSON_URL, {
    method: 'POST',
    headers: {
      'Content-Type':        'application/json',
      pinata_api_key:        process.env.PINATA_API_KEY!,
      pinata_secret_api_key: process.env.PINATA_SECRET_KEY!,
    },
    body: JSON.stringify({
      pinataMetadata: { name },
      pinataOptions:  { cidVersion: 1 },
      pinataContent:  jsonBody,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata JSON upload failed: ${res.status} ${text}`);
  }

  const json = await res.json() as { IpfsHash: string };
  const cid  = json.IpfsHash;

  return {
    cid,
    url: `https://gateway.pinata.cloud/ipfs/${cid}`,
  };
}

// ── Convenience: resize + upload image ────────────────────────────────
export async function resizeAndUpload(
  originalBuffer: Buffer,
  tokenId: number,
  title: string
): Promise<{ cid: string; url: string }> {
  const resized  = await resizeForIpfs(originalBuffer);
  const filename = `rrg-${tokenId}.jpg`;
  return uploadToIpfs(resized, filename, {
    tokenId:  String(tokenId),
    title,
    platform: 'RRG / realrealgenuine.com',
  });
}

// ── Upload to IPFS after purchase — shared by confirm + claim routes ──
//
// Uploads JPEG image → ipfs_image_cid
// Builds ERC-1155 metadata JSON → uploads → ipfs_cid (what tokenURI points to)
// Updates DB with both CIDs, sets on-chain tokenURI to ipfs://{metadataCid}
//
// Skips silently if ipfs_image_cid already set (idempotent).
// Returns { imageCid, metadataCid, metadataUrl } or null if already done.
export async function uploadToIpfsInBackground(
  drop: {
    id: string;
    ipfs_image_cid?: string | null;
    jpeg_storage_path: string;
    token_id: number | null;
    title: string;
    creator_wallet?: string | null;
    edition_size?: number | null;
    price_usdc?: string | number | null;
  },
): Promise<{ imageCid: string; metadataCid: string; metadataUrl: string } | null> {
  if (!drop || drop.ipfs_image_cid) return null; // already uploaded

  const tokenId = drop.token_id!;

  // 1. Resize and upload JPEG image
  const jpegBuffer            = await downloadFile(drop.jpeg_storage_path);
  const { cid: imageCid }     = await resizeAndUpload(jpegBuffer, tokenId, drop.title);

  // 2. Build ERC-1155 metadata JSON (OpenSea / marketplace compatible)
  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL || 'https://realrealgenuine.com';
  const priceStr = drop.price_usdc != null ? String(drop.price_usdc) : null;
  const attributes: Array<{ trait_type: string; value: string | number; display_type?: string }> = [
    { trait_type: 'Edition Size',   value: drop.edition_size ?? 1, display_type: 'number' },
    { trait_type: 'Platform',       value: 'RRG — Real Real Genuine' },
  ];
  if (priceStr)            attributes.push({ trait_type: 'Price (USDC)', value: priceStr });
  if (drop.creator_wallet) attributes.push({ trait_type: 'Creator',      value: drop.creator_wallet });

  const metadata = {
    name:         `RRG #${tokenId} — ${drop.title}`,
    description:  `RRG — Real Real Genuine. A limited edition co-created design. Edition of ${drop.edition_size ?? 1}.`,
    image:        `ipfs://${imageCid}`,
    external_url: `${siteUrl}/rrg/drop/${tokenId}`,
    attributes,
  };

  // 3. Upload metadata JSON
  const { cid: metadataCid, url: metadataUrl } = await uploadJsonToIpfs(
    metadata,
    `rrg-${tokenId}-metadata.json`
  );

  // 4. Persist both CIDs to DB
  await db
    .from('rrg_submissions')
    .update({
      ipfs_image_cid: imageCid,
      ipfs_cid:       metadataCid,
      ipfs_url:       metadataUrl,
    })
    .eq('id', drop.id);

  // 5. Update token URI on-chain (points to metadata JSON, not raw JPEG)
  try {
    const contract = getRRGContract();
    const ipfsUri  = `ipfs://${metadataCid}`;
    const tx       = await contract.setTokenURI(tokenId, ipfsUri);
    await tx.wait(1);
    console.log(`[ipfs] Token ${tokenId} URI set to ${ipfsUri}`);
  } catch (err) {
    console.error('[ipfs] setTokenURI failed:', err);
  }

  return { imageCid, metadataCid, metadataUrl };
}
