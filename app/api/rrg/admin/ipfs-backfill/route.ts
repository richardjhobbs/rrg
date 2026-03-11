/**
 * POST /api/rrg/admin/ipfs-backfill
 *
 * Admin-only. Finds all approved drops where ipfs_image_cid is NULL (i.e. never had
 * proper ERC-1155 metadata generated), then for each:
 *   1. Uploads resized JPEG to IPFS → ipfs_image_cid
 *   2. Builds and uploads ERC-1155 metadata JSON → ipfs_cid (tokenURI target)
 *   3. Calls setTokenURI on-chain to point to the metadata JSON
 *
 * Processes sequentially to avoid hammering Pinata / the RPC.
 * Safe to re-run — skips any that already have ipfs_image_cid set.
 * Also catches tokens that previously had ipfs_cid set to a raw JPEG (old behaviour).
 */

import { NextResponse } from 'next/server';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';
import { db } from '@/lib/rrg/db';
import { uploadToIpfsInBackground } from '@/lib/rrg/ipfs';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  // ── Find all approved submissions missing the image IPFS CID ──────────
  const { data: missing, error } = await db
    .from('rrg_submissions')
    .select('id, token_id, title, jpeg_storage_path, ipfs_cid, ipfs_image_cid, creator_wallet, edition_size, price_usdc')
    .eq('status', 'approved')
    .is('ipfs_image_cid', null)
    .order('token_id', { ascending: true });

  if (error) {
    return NextResponse.json({ error: `DB query failed: ${error.message}` }, { status: 500 });
  }

  if (!missing || missing.length === 0) {
    return NextResponse.json({ message: 'All approved drops already have IPFS image CIDs. Nothing to do.', processed: 0 });
  }

  // ── Process each one sequentially ──────────────────────────────────
  const results: {
    tokenId:     number | null;
    title:       string;
    status:      'ok' | 'failed';
    imageCid?:   string;
    metadataCid?: string;
    error?:      string;
  }[] = [];

  for (const drop of missing) {
    try {
      const result = await uploadToIpfsInBackground(drop);

      results.push({
        tokenId:     drop.token_id,
        title:       drop.title,
        status:      'ok',
        imageCid:    result?.imageCid    ?? undefined,
        metadataCid: result?.metadataCid ?? undefined,
      });

      console.log(`[ipfs-backfill] Token #${drop.token_id} (${drop.title}) — image + metadata pinned OK`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        tokenId: drop.token_id,
        title:   drop.title,
        status:  'failed',
        error:   msg,
      });
      console.error(`[ipfs-backfill] Token #${drop.token_id} failed:`, err);
    }
  }

  const ok     = results.filter((r) => r.status === 'ok').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return NextResponse.json({
    processed: results.length,
    ok,
    failed,
    results,
  });
}
