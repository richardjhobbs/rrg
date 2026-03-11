import { NextRequest, NextResponse } from 'next/server';
import { getCurrentBrief } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// GET /api/rrg/brief — public: returns current active brief or null
// Optional: ?brandId=UUID to scope to a specific brand
export async function GET(req: NextRequest) {
  try {
    const brandId = req.nextUrl.searchParams.get('brandId') || undefined;
    const brief = await getCurrentBrief(brandId);
    return NextResponse.json({ brief });
  } catch (err) {
    console.error('[/api/rrg/brief]', err);
    return NextResponse.json({ error: 'Failed to fetch brief' }, { status: 500 });
  }
}
