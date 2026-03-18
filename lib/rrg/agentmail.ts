/**
 * AgentMail integration — email inbox for AI agent submissions
 *
 * Gives DrHobbs a dedicated inbox (e.g. submit@realrealgenuine.com or
 * drhobbs@agentmail.to) that AI agents can email with image attachments.
 *
 * This solves the MindTheGap/Animoca Minds problem: their platform resolves
 * internal artifact GUIDs into real image attachments when sending email,
 * so agents can submit designs by simply emailing us.
 *
 * Setup:
 *   1. Sign up at console.agentmail.to, get API key
 *   2. Set AGENTMAIL_API_KEY in .env.local
 *   3. Optionally set AGENTMAIL_INBOX_ID if inbox already created
 *   4. Call POST /api/rrg/admin/agentmail-setup to create inbox + webhook
 */

import { AgentMailClient, AgentMail } from 'agentmail';

// ── Client singleton ─────────────────────────────────────────────────────
let _client: AgentMailClient | null = null;

export function getAgentMailClient(): AgentMailClient | null {
  if (!process.env.AGENTMAIL_API_KEY) return null;
  if (!_client) {
    _client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY });
  }
  return _client;
}

// ── Inbox management ─────────────────────────────────────────────────────

export async function createSubmitInbox(
  username = 'submit',
  domain?: string,
): Promise<{ inboxId: string; address: string }> {
  const client = getAgentMailClient();
  if (!client) throw new Error('AGENTMAIL_API_KEY not configured');

  const params: Record<string, string> = { username };
  if (domain) params.domain = domain;

  const inbox = await client.inboxes.create(params);
  const address = `${username}@${domain || 'agentmail.to'}`;
  console.log(`[agentmail] Created inbox ${inbox.inboxId}: ${address}`);
  return { inboxId: inbox.inboxId, address };
}

export async function listInboxes() {
  const client = getAgentMailClient();
  if (!client) throw new Error('AGENTMAIL_API_KEY not configured');
  return client.inboxes.list();
}

// ── Message retrieval ────────────────────────────────────────────────────

export interface AgentMailMessage {
  inboxId: string;
  messageId: string;
  threadId?: string;
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    attachmentId: string;
    filename: string;
    contentType: string;
    size?: number;
  }>;
  timestamp?: string;
}

export async function listMessages(
  inboxId: string,
  limit = 20,
): Promise<AgentMailMessage[]> {
  const client = getAgentMailClient();
  if (!client) throw new Error('AGENTMAIL_API_KEY not configured');

  const res = await client.inboxes.messages.list(inboxId, { limit });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((res as any).messages || []).map((m: any) => ({
    inboxId,
    messageId: m.messageId ?? m.message_id,
    threadId: m.threadId ?? m.thread_id,
    from: m.from,
    to: Array.isArray(m.to) ? m.to.join(', ') : m.to,
    subject: m.subject || '',
    text: m.text || m.extractedText || m.extracted_text,
    html: m.html || m.extractedHtml || m.extracted_html,
    attachments: (m.attachments || []).map((a: any) => ({
      attachmentId: a.attachmentId ?? a.attachment_id ?? a.id,
      filename: a.filename || a.name || 'unknown',
      contentType: a.contentType ?? a.content_type ?? 'application/octet-stream',
      size: a.size,
    })),
    timestamp: m.timestamp || m.createdAt || m.created_at,
  }));
}

export async function getMessage(
  inboxId: string,
  messageId: string,
): Promise<AgentMailMessage> {
  const client = getAgentMailClient();
  if (!client) throw new Error('AGENTMAIL_API_KEY not configured');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = await client.inboxes.messages.get(inboxId, messageId);
  return {
    inboxId,
    messageId: m.messageId ?? m.message_id,
    threadId: m.threadId ?? m.thread_id,
    from: m.from,
    to: Array.isArray(m.to) ? m.to.join(', ') : m.to,
    subject: m.subject || '',
    text: m.text || m.extractedText || m.extracted_text,
    html: m.html || m.extractedHtml || m.extracted_html,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attachments: (m.attachments || []).map((a: any) => ({
      attachmentId: a.attachmentId ?? a.attachment_id ?? a.id,
      filename: a.filename || a.name || 'unknown',
      contentType: a.contentType ?? a.content_type ?? 'application/octet-stream',
      size: a.size,
    })),
    timestamp: m.timestamp || m.createdAt || m.created_at,
  };
}

// ── Attachment download ──────────────────────────────────────────────────

export async function downloadAttachment(
  inboxId: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const client = getAgentMailClient();
  if (!client) throw new Error('AGENTMAIL_API_KEY not configured');

  const resp = await client.inboxes.messages.getAttachment(
    inboxId,
    messageId,
    attachmentId,
  );

  // The SDK returns a response object with binary helpers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = resp as any;

  // Try various response formats the SDK might return
  if (typeof r.bytes === 'function') {
    const bytes = await r.bytes();
    return Buffer.from(bytes);
  }
  if (typeof r.arrayBuffer === 'function') {
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
  }
  if (r.data && typeof r.data === 'string') {
    // Base64-encoded content
    return Buffer.from(r.data, 'base64');
  }
  if (r.content && typeof r.content === 'string') {
    return Buffer.from(r.content, 'base64');
  }
  if (Buffer.isBuffer(r)) {
    return r;
  }

  // Fallback: fetch via REST API directly
  const apiKey = process.env.AGENTMAIL_API_KEY!;
  const url = `https://api.agentmail.to/v0/inboxes/${inboxId}/messages/${messageId}/attachments/${attachmentId}`;
  const fetchResp = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!fetchResp.ok) {
    throw new Error(`AgentMail attachment download failed: ${fetchResp.status}`);
  }
  return Buffer.from(await fetchResp.arrayBuffer());
}

// ── Send email ───────────────────────────────────────────────────────────

export async function sendEmail(
  inboxId: string,
  params: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
  },
) {
  const client = getAgentMailClient();
  if (!client) throw new Error('AGENTMAIL_API_KEY not configured');

  return client.inboxes.messages.send(inboxId, params);
}

// ── Reply to email ───────────────────────────────────────────────────────

export async function replyToEmail(
  inboxId: string,
  messageId: string,
  params: {
    text?: string;
    html?: string;
  },
) {
  const client = getAgentMailClient();
  if (!client) throw new Error('AGENTMAIL_API_KEY not configured');

  return client.inboxes.messages.reply(inboxId, messageId, params);
}

// ── Webhook management ───────────────────────────────────────────────────

export async function createWebhook(
  url: string,
  eventTypes: AgentMail.EventType[] = [AgentMail.EventType.MessageReceived],
) {
  const client = getAgentMailClient();
  if (!client) throw new Error('AGENTMAIL_API_KEY not configured');

  return client.webhooks.create({ url, eventTypes });
}

export async function listWebhooks() {
  const client = getAgentMailClient();
  if (!client) throw new Error('AGENTMAIL_API_KEY not configured');

  return client.webhooks.list();
}

// ── Submission email parsing (reuses submit-email logic) ─────────────────

export function parseSubmissionEmail(subject: string, body: string): {
  title: string | null;
  wallet: string | null;
  description: string | null;
  briefId: string | null;
} {
  // Parse title from subject
  let title: string | null = null;
  const titleMatch = subject.match(/^(?:RRG|RRG Submission)\s*[:—–-]\s*(.+)/i);
  if (titleMatch) {
    title = titleMatch[1].trim().slice(0, 60);
  } else {
    const cleaned = subject.replace(/^(?:Re|Fwd|Fw)\s*:\s*/gi, '').trim();
    title = cleaned.slice(0, 60) || null;
  }

  // Parse structured fields from body
  let wallet: string | null = null;
  let description: string | null = null;
  let briefId: string | null = null;
  const descLines: string[] = [];
  let inDesc = false;

  for (const line of body.split(/\r?\n/)) {
    const walletMatch = line.match(/^wallet\s*[:=]\s*(0x[0-9a-fA-F]{40})/i);
    if (walletMatch) { wallet = walletMatch[1]; inDesc = false; continue; }

    const briefMatch = line.match(/^brief\s*[:=]\s*(.+)/i);
    if (briefMatch) { briefId = briefMatch[1].trim(); inDesc = false; continue; }

    const descMatch = line.match(/^description\s*[:=]\s*(.+)/i);
    if (descMatch) { descLines.push(descMatch[1].trim()); inDesc = true; continue; }

    if (inDesc && line.trim()) { descLines.push(line.trim()); }
    else if (inDesc && !line.trim()) { inDesc = false; }
  }

  if (descLines.length) description = descLines.join(' ').slice(0, 280);
  return { title, wallet, description, briefId };
}

// ── Image format detection ───────────────────────────────────────────────

export function detectImageFormat(buf: Buffer): { ext: 'jpg' | 'png'; mimeType: string } | null {
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)
    return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47)
    return { ext: 'png', mimeType: 'image/png' };
  return null;
}
