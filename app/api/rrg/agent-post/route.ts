import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/rrg/agent-post — DEPRECATED (5 April 2026)
//
// This endpoint used to let agents post content to Telegram + BlueSky + Discord
// via autopostGeneric(). It was being abused: agents (Priscilla, Rosie, etc.)
// were calling it with their own conversational replies, which cross-posted
// private Discord conversations to public Telegram and BlueSky channels.
//
// Fix: the endpoint is disabled. Agents reply in Discord via nanobot's native
// Discord integration only. Platform autoposts (listing approvals, sales) use
// autopostApproval() / autopostSale() directly from their trigger routes
// (approve, confirm, claim) — not via this API.
//
// For marketing content, a separate approval-gated path should be built.
export async function POST() {
  return NextResponse.json(
    {
      error: 'Endpoint deprecated',
      message: 'agent-post has been disabled. Agents reply in Discord directly via their Discord bot connection. Do not call this endpoint.',
    },
    { status: 410 },
  );
}
