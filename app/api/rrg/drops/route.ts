import { NextRequest, NextResponse } from 'next/server';
import { getApprovedDrops, getDropByTokenId, getCurrentBrief } from '@/lib/rrg/db';
import { getRRGReadOnly } from '@/lib/rrg/contract';

export const dynamic = 'force-dynamic';

// GET /api/rrg/drops — public: all approved drops with on-chain minted counts
// GET /api/rrg/drops?tokenId=N — single drop
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tokenIdParam = searchParams.get('tokenId');

    if (tokenIdParam) {
      // Single drop
      const tokenId = parseInt(tokenIdParam, 10);
      if (isNaN(tokenId)) {
        return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
      }

      const drop = await getDropByTokenId(tokenId);
      if (!drop) {
        return NextResponse.json({ error: 'Drop not found' }, { status: 404 });
      }

      // Fetch live on-chain data
      let onChain = null;
      try {
        const isTestnet = process.env.NEXT_PUBLIC_CHAIN_ID === '84532';
        const contract  = getRRGReadOnly(isTestnet);
        const data      = await contract.getDrop(tokenId);
        onChain = {
          minted:    Number(data.minted),
          maxSupply: Number(data.maxSupply),
          active:    data.active,
          soldOut:   Number(data.minted) >= Number(data.maxSupply),
        };
      } catch {
        // Contract not yet deployed or network issue — return DB data only
      }

      return NextResponse.json({ drop: { ...drop, onChain } });
    }

    // All drops
    const [drops, brief] = await Promise.all([
      getApprovedDrops(),
      getCurrentBrief(),
    ]);

    // Optionally enrich with on-chain minted counts
    let enriched = drops;
    try {
      const isTestnet = process.env.NEXT_PUBLIC_CHAIN_ID === '84532';
      const contract  = getRRGReadOnly(isTestnet);

      enriched = await Promise.all(
        drops.map(async (drop) => {
          if (!drop.token_id) return { ...drop, onChain: null };
          try {
            const data = await contract.getDrop(drop.token_id);
            return {
              ...drop,
              onChain: {
                minted:    Number(data.minted),
                maxSupply: Number(data.maxSupply),
                active:    data.active,
                soldOut:   Number(data.minted) >= Number(data.maxSupply),
              },
            };
          } catch {
            return { ...drop, onChain: null };
          }
        })
      );
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ drops: enriched, currentBrief: brief });
  } catch (err) {
    console.error('[/api/rrg/drops]', err);
    return NextResponse.json({ error: 'Failed to fetch drops' }, { status: 500 });
  }
}
