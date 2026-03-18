import { NextRequest, NextResponse } from 'next/server';
import { db, getDistributions } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';
import { transferUsdc, getPlatformUsdcBalance, getPlatformSigner } from '@/lib/rrg/contract';

export const dynamic = 'force-dynamic';

// POST /api/rrg/admin/distributions/payout — process pending distributions (super-admin only)
// Body: { brandId? } — optional filter by brand
export async function POST(req: NextRequest) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const brandFilter = body.brandId ?? undefined;

    // Fetch pending distributions
    const all = await getDistributions('pending', brandFilter);

    // Skip legacy splits (already handled on-chain)
    const pending = all.filter((d) => d.split_type !== 'legacy_70_30');

    if (pending.length === 0) {
      return NextResponse.json({ message: 'No pending distributions to process', processed: 0 });
    }

    // Check platform wallet balance
    const balance = await getPlatformUsdcBalance();
    const totalNeeded = pending.reduce(
      (sum, d) => sum + Number(d.creator_usdc) + Number(d.brand_usdc),
      0,
    );

    if (balance < totalNeeded) {
      return NextResponse.json({
        error: `Insufficient platform USDC balance. Have $${balance.toFixed(2)}, need $${totalNeeded.toFixed(2)}`,
        balance,
        totalNeeded,
      }, { status: 400 });
    }

    // Get starting nonce — avoids "replacement fee too low" when sending sequential txs
    const signer = getPlatformSigner();
    let nonce = await signer.getNonce('latest');

    // Process each distribution
    const results: Array<{
      id: string;
      status: 'completed' | 'failed';
      creatorTx?: string;
      brandTx?: string;
      error?: string;
    }> = [];

    for (const dist of pending) {
      const creatorAmount = Number(dist.creator_usdc);
      const brandAmount   = Number(dist.brand_usdc);
      const txHashes: string[] = [];

      try {
        // Transfer to creator
        if (creatorAmount > 0 && dist.creator_wallet) {
          const result = await transferUsdc(dist.creator_wallet, creatorAmount, nonce);
          txHashes.push(`creator:${result.hash}`);
          nonce = result.nonce + 1;
        }

        // Transfer to brand
        if (brandAmount > 0 && dist.brand_wallet) {
          const result = await transferUsdc(dist.brand_wallet, brandAmount, nonce);
          txHashes.push(`brand:${result.hash}`);
          nonce = result.nonce + 1;
        }

        // Mark completed
        await db
          .from('rrg_distributions')
          .update({
            status: 'completed',
            notes:  txHashes.join(' | ') || 'No transfers needed (platform-only)',
          })
          .eq('id', dist.id);

        results.push({
          id:        dist.id,
          status:    'completed',
          creatorTx: txHashes.find((t) => t.startsWith('creator:'))?.slice(8),
          brandTx:   txHashes.find((t) => t.startsWith('brand:'))?.slice(6),
        });

      } catch (err) {
        const errMsg = String(err);
        console.error(`[payout] Distribution ${dist.id} failed:`, errMsg);

        await db
          .from('rrg_distributions')
          .update({
            status: 'failed',
            notes:  `Payout error: ${errMsg.slice(0, 500)}`,
          })
          .eq('id', dist.id);

        results.push({ id: dist.id, status: 'failed', error: errMsg.slice(0, 200) });
      }
    }

    const succeeded = results.filter((r) => r.status === 'completed').length;
    const failed    = results.filter((r) => r.status === 'failed').length;

    return NextResponse.json({
      processed:  results.length,
      succeeded,
      failed,
      totalDistributed: pending
        .filter((_, i) => results[i]?.status === 'completed')
        .reduce((sum, d) => sum + Number(d.creator_usdc) + Number(d.brand_usdc), 0),
      results,
    });

  } catch (err) {
    console.error('[/api/rrg/admin/distributions/payout]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
