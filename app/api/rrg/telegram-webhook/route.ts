/**
 * POST /api/rrg/telegram-webhook
 *
 * Webhook endpoint for Telegram Bot API updates.
 * Receives messages from @realrealgenuine_bot, routes to command handlers
 * or Together.ai LLM for conversational responses.
 *
 * Security: Verifies x-telegram-bot-api-secret-token header.
 * Always returns 200 to prevent Telegram retry storms.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleUpdate, isRelevant, type TgUpdate } from '@/lib/rrg/telegram-bot';

export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET = process.env.RRG_TG_WEBHOOK_SECRET ?? '';

export async function POST(req: NextRequest) {
  // Verify webhook secret
  if (WEBHOOK_SECRET) {
    const token = req.headers.get('x-telegram-bot-api-secret-token');
    if (token !== WEBHOOK_SECRET) {
      console.warn('[telegram-webhook] invalid secret token');
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  // Only handle message updates
  if (!update.message) {
    return NextResponse.json({ ok: true, skipped: 'no message' });
  }

  // Check relevance (DM, @mention, /command, reply to bot)
  if (!isRelevant(update)) {
    return NextResponse.json({ ok: true, skipped: 'not relevant' });
  }

  // Handle the update (fire-and-forget error handling)
  try {
    await handleUpdate(update);
  } catch (err) {
    console.error('[telegram-webhook] handleUpdate error:', err);
    // Try to send error message to chat
    try {
      const chatId = update.message.chat.id;
      const token = process.env.RRG_TG_BOT_TOKEN ?? '';
      if (token) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text:    "Something went wrong. Try /drops or /briefs for quick info!",
            reply_to_message_id:         update.message.message_id,
            allow_sending_without_reply: true,
          }),
          signal: AbortSignal.timeout(5_000),
        });
      }
    } catch {
      // Swallow — don't let error reporting fail the webhook
    }
  }

  // Always return 200 to prevent Telegram retries
  return NextResponse.json({ ok: true });
}
