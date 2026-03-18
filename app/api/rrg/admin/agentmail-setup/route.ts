/**
 * POST /api/rrg/admin/agentmail-setup
 *
 * Admin-only route to set up AgentMail:
 *   - Creates a submission inbox (if not already configured)
 *   - Registers a webhook pointing to /api/rrg/agentmail-webhook
 *   - Returns inbox address and webhook details
 *
 * GET /api/rrg/admin/agentmail-setup
 *   - Shows current AgentMail status: inboxes, webhooks, recent messages
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getAgentMailClient,
  createSubmitInbox,
  listInboxes,
  listWebhooks,
  createWebhook,
  listMessages,
} from '@/lib/rrg/agentmail';

export const dynamic = 'force-dynamic';

async function isAdmin() {
  const jar = await cookies();
  return jar.get('admin_token')?.value === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getAgentMailClient();
  if (!client) {
    return NextResponse.json({
      configured: false,
      error: 'AGENTMAIL_API_KEY not set in .env.local',
      setup_steps: [
        '1. Sign up at https://console.agentmail.to',
        '2. Create an API key',
        '3. Add AGENTMAIL_API_KEY=am_... to .env.local',
        '4. Optionally add AGENTMAIL_WEBHOOK_SECRET for security',
        '5. POST to this endpoint to create inbox + webhook',
      ],
    });
  }

  try {
    const [inboxes, webhooks] = await Promise.all([
      listInboxes(),
      listWebhooks(),
    ]);

    // Get recent messages from first inbox
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inboxList = (inboxes as any).inboxes || (inboxes as any) || [];
    let recentMessages: unknown[] = [];
    const firstInboxId = Array.isArray(inboxList) && inboxList.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (inboxList[0] as any).inboxId || (inboxList[0] as any).inbox_id
      : process.env.AGENTMAIL_INBOX_ID;

    if (firstInboxId) {
      try {
        recentMessages = await listMessages(firstInboxId, 10);
      } catch {
        // Inbox might not exist yet
      }
    }

    return NextResponse.json({
      configured: true,
      inbox_id: process.env.AGENTMAIL_INBOX_ID || firstInboxId || null,
      inboxes: inboxList,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      webhooks: (webhooks as any).webhooks || (webhooks as any) || [],
      recent_messages: recentMessages,
    });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      error: `AgentMail API error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getAgentMailClient();
  if (!client) {
    return NextResponse.json({
      error: 'AGENTMAIL_API_KEY not set in .env.local',
    }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const username = (body.username as string) || 'submit';
    const domain = (body.domain as string) || undefined;
    const webhookUrl = (body.webhook_url as string) ||
      `${process.env.NEXT_PUBLIC_SITE_URL || 'https://realrealgenuine.com'}/api/rrg/agentmail-webhook` +
      (process.env.AGENTMAIL_WEBHOOK_SECRET ? `?secret=${process.env.AGENTMAIL_WEBHOOK_SECRET}` : '');

    const results: Record<string, unknown> = {};

    // ── Step 1: Create inbox ──────────────────────────────────────────
    if (body.skip_inbox !== true) {
      try {
        const inbox = await createSubmitInbox(username, domain);
        results.inbox = inbox;
        results.inbox_address = `${username}@${domain || 'agentmail.to'}`;
        console.log(`[agentmail-setup] Created inbox: ${results.inbox_address}`);
      } catch (inboxErr) {
        const msg = inboxErr instanceof Error ? inboxErr.message : String(inboxErr);
        if (msg.includes('already') || msg.includes('exists') || msg.includes('taken')) {
          results.inbox = { note: 'Inbox already exists', username, domain: domain || 'agentmail.to' };
        } else {
          results.inbox_error = msg;
        }
      }
    }

    // ── Step 2: Register webhook ──────────────────────────────────────
    if (body.skip_webhook !== true) {
      try {
        const webhook = await createWebhook(webhookUrl, ['message.received']);
        results.webhook = webhook;
        results.webhook_url = webhookUrl;
        console.log(`[agentmail-setup] Created webhook: ${webhookUrl}`);
      } catch (whErr) {
        results.webhook_error = whErr instanceof Error ? whErr.message : String(whErr);
      }
    }

    // ── Step 3: Return env vars to set ────────────────────────────────
    results.env_vars_to_set = {
      AGENTMAIL_INBOX_ID: results.inbox && typeof results.inbox === 'object' && 'inboxId' in results.inbox
        ? (results.inbox as Record<string, unknown>).inboxId
        : '(set from inbox creation response)',
      AGENTMAIL_WEBHOOK_SECRET: process.env.AGENTMAIL_WEBHOOK_SECRET ? '(already set)' : '(optional, recommended)',
    };

    results.next_steps = [
      'Add AGENTMAIL_INBOX_ID to .env.local',
      'Add AGENTMAIL_WEBHOOK_SECRET to .env.local (optional but recommended)',
      'Rebuild and restart: npm run build && pm2 restart rrg-app',
      `Test by sending an email to ${results.inbox_address || username + '@agentmail.to'}`,
    ];

    return NextResponse.json(results, { status: 201 });

  } catch (err) {
    console.error('[agentmail-setup] Error:', err);
    return NextResponse.json({
      error: `Setup failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
