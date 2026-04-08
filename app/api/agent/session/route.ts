import { NextResponse } from 'next/server';
import { getSessionAgent } from '@/lib/agent/auth';

export const dynamic = 'force-dynamic';

/** GET /api/agent/session — Get current agent from session cookie */
export async function GET() {
  const agent = await getSessionAgent();

  if (!agent) {
    return NextResponse.json({ error: 'No active session' }, { status: 401 });
  }

  return NextResponse.json({ agent });
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
