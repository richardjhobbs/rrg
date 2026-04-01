/**
 * POST /api/rrg/agent-post
 *
 * General-purpose content posting endpoint for Priscilla (and future agents).
 * Accepts free-form text and posts to one or more platforms using the
 * existing RRG credentials.
 *
 * Auth: AGENT_POST_SECRET env var must match the `secret` field in the request.
 *
 * Body:
 * {
 *   "secret":     string,                          // required
 *   "content":    string,                          // required — the text to post
 *   "platforms":  ("bluesky"|"telegram"|"discord")[], // optional, defaults to all
 *   "channel":    string  // optional Discord channel name, defaults to rrg_announcements
 *                 // RRG public:    "rrg_drops" | "rrg_announcements"
 *                 // Virtual Office: "general" | "outreach" | "briefings" | "product_dev" | "marketing" | "research" | "admin"
 * }
 *
 * Response:
 * { "success": true|false, "posted_to": string[], "errors": string[] }
 */

import { NextResponse } from 'next/server';

const AGENT_POST_SECRET = process.env.AGENT_POST_SECRET ?? '';
const TG_BOT_TOKEN      = process.env.RRG_TG_BOT_TOKEN ?? '';
const TG_CHAT_ID        = process.env.TG_CHAT_ID        ?? '';
const BSKY_HANDLE       = process.env.BSKY_HANDLE       ?? '';
const BSKY_APP_PASS     = process.env.BSKY_APP_PASS     ?? '';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? '';

const DISCORD_CHANNELS: Record<string, string> = {
  // RRG public channels
  rrg_drops:         '1482200038896828678',
  rrg_announcements: '1482199995259031674',
  // Virtual Office team channels
  briefings:         '1487428111816720384',
  product_dev:       '1487428197112090805',
  marketing:         '1487428258088751144',
  research:          '1487428316578451576',
  admin:             '1487430607825801377',
  general:           '1487428366813630474',
  outreach:          '1488807191292149861',
};

type Platform = 'bluesky' | 'telegram' | 'discord';
type Result   = { ok: boolean; error?: string };

// ── Telegram ─────────────────────────────────────────────────────────────

async function postTelegram(content: string): Promise<Result> {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return { ok: false, error: 'not configured' };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        chat_id:              TG_CHAT_ID,
        text:                 content,
        link_preview_options: { is_disabled: false },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}: ${await resp.text()}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ── BlueSky ───────────────────────────────────────────────────────────────

async function postBluesky(content: string): Promise<Result> {
  if (!BSKY_HANDLE || !BSKY_APP_PASS) return { ok: false, error: 'not configured' };
  try {
    // Auth
    const authResp = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ identifier: BSKY_HANDLE, password: BSKY_APP_PASS }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!authResp.ok) return { ok: false, error: `auth failed: HTTP ${authResp.status}` };
    const { accessJwt } = await authResp.json();

    // Enforce 300-char BSky limit
    const text = content.length > 300 ? content.slice(0, 297) + '…' : content;

    const postResp = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessJwt}` },
      body:    JSON.stringify({
        repo:       BSKY_HANDLE,
        collection: 'app.bsky.feed.post',
        record:     {
          $type:     'app.bsky.feed.post',
          text,
          createdAt: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!postResp.ok) return { ok: false, error: `post failed: HTTP ${postResp.status}: ${await postResp.text()}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ── Discord ───────────────────────────────────────────────────────────────

async function postDiscord(content: string, channelId: string): Promise<Result> {
  if (!DISCORD_BOT_TOKEN) return { ok: false, error: 'not configured' };
  try {
    const resp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bot ${DISCORD_BOT_TOKEN}`,
      },
      body:   JSON.stringify({ content }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}: ${await resp.text()}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ── Route ─────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      secret,
      content,
      platforms,
      channel = 'rrg_announcements',
    } = body as {
      secret:    string;
      content:   string;
      platforms?: Platform[];
      channel?:  string;
    };

    if (!AGENT_POST_SECRET || secret !== AGENT_POST_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }
    if (content.length > 4000) {
      return NextResponse.json({ error: 'content exceeds 4000 chars' }, { status: 400 });
    }

    const requested: Platform[] = Array.isArray(platforms) && platforms.length > 0
      ? platforms
      : ['bluesky', 'telegram', 'discord'];

    const discordChannelId = DISCORD_CHANNELS[channel] ?? DISCORD_CHANNELS.rrg_announcements;

    const results: Record<string, Result> = {};

    await Promise.allSettled([
      requested.includes('telegram') &&
        postTelegram(content).then(r => { results.telegram = r; }),
      requested.includes('bluesky') &&
        postBluesky(content).then(r => { results.bluesky = r; }),
      requested.includes('discord') &&
        postDiscord(content, discordChannelId).then(r => { results.discord = r; }),
    ]);

    const posted_to = Object.entries(results).filter(([, v]) => v.ok).map(([k]) => k);
    const errors    = Object.entries(results).filter(([, v]) => !v.ok).map(([k, v]) => `${k}: ${v.error}`);

    console.log(`[agent-post] posted_to=${posted_to.join(',') || 'none'} errors=${errors.join(';') || 'none'}`);

    return NextResponse.json({
      success:   errors.length === 0,
      posted_to,
      errors,
    });

  } catch (err) {
    console.error('[agent-post]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
