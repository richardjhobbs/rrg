import { NextResponse } from 'next/server';
import { getCurrentBrief } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

// GET /api/rrg/brief — public: returns current active brief or null
export async function GET() {
  try {
    const brief = await getCurrentBrief();
    return NextResponse.json({ brief });
  } catch (err) {
    console.error('[/api/rrg/brief]', err);
    return NextResponse.json({ error: 'Failed to fetch brief' }, { status: 500 });
  }
}
