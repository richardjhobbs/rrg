import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { getSessionAgent } from '@/lib/agent/auth';

export const dynamic = 'force-dynamic';

/** GET /api/agent/session — Get current agent from session cookie or wallet lookup */
export async function GET(req: NextRequest) {
  // Try cookie first
  const agent = await getSessionAgent();
  if (agent) {
    return NextResponse.json({ agent });
  }

  // Fallback: wallet-based lookup
  const wallet = req.nextUrl.searchParams.get('wallet')?.toLowerCase();
  if (wallet) {
    const { data } = await db
      .from('agent_agents')
      .select('*')
      .eq('wallet_address', wallet)
      .single();

    if (data) {
      // Restore the session cookie
      const response = NextResponse.json({ agent: data });
      response.cookies.set('via_agent_session', data.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
      return response;
    }
  }

  return NextResponse.json({ error: 'No active session' }, { status: 401 });
}

/** DELETE /api/agent/session — Sign out */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('via_agent_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
