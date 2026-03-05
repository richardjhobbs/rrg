import { NextResponse } from 'next/server';
import { getRecentBriefs } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// GET /api/rrg/briefs — public: all briefs (active + last 6 closed)
export async function GET() {
  try {
    const briefs = await getRecentBriefs(6);
    return NextResponse.json({ briefs });
  } catch (err) {
    console.error('[/api/rrg/briefs]', err);
    return NextResponse.json({ error: 'Failed to fetch briefs' }, { status: 500 });
  }
}
