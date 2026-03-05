/**
 * IPFS upload via Pinata
 *
 * Only used AFTER a successful mint, for the low-res JPEG (max 800px longest side).
 * Never for original files, never before mint confirmation.
 */

import sharp from 'sharp';

const PINATA_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

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

// ── Convenience: resize + upload ──────────────────────────────────────
export async function resizeAndUpload(
  originalBuffer: Buffer,
  tokenId: number,
  title: string
): Promise<{ cid: string; url: string }> {
  const resized  = await resizeForIpfs(originalBuffer);
  const filename = `rrg-${tokenId}.jpg`;
  return uploadToIpfs(resized, filename, {
    tokenId:    String(tokenId),
    title,
    platform:   'RRG / richard-hobbs.com',
  });
}
