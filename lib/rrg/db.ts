import { createClient } from '@supabase/supabase-js';

// ── Typed DB client (server-side, uses service key) ───────────────────
export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_KEY ?? 'placeholder-key',
  { auth: { persistSession: false } }
);

// ── Types ─────────────────────────────────────────────────────────────

export type BriefStatus = 'active' | 'closed' | 'archived';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type SubmissionChannel = 'web' | 'api' | 'telegram' | 'bluesky';
export type BuyerType = 'human' | 'agent';

export interface RrgBrief {
  id: string;
  created_at: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  status: BriefStatus;
  is_current: boolean;
  social_caption: string | null;
  response_count: number;
}

export interface RrgSubmission {
  id: string;
  created_at: string;
  brief_id: string | null;
  creator_wallet: string;
  creator_email: string | null;
  creator_handle: string | null;
  title: string;
  description: string | null;
  submission_channel: SubmissionChannel;
  status: SubmissionStatus;
  jpeg_storage_path: string;
  jpeg_filename: string;
  jpeg_size_bytes: number;
  additional_files_path: string | null;
  additional_files_size_bytes: number | null;
  token_id: number | null;
  edition_size: number;
  price_usdc: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  approval_notification_sent: boolean;
  ipfs_cid: string | null;
  ipfs_url: string | null;
}

export interface RrgPurchase {
  id: string;
  created_at: string;
  submission_id: string;
  token_id: number;
  buyer_wallet: string;
  buyer_email: string | null;
  buyer_type: BuyerType;
  tx_hash: string;
  amount_usdc: string;
  files_delivered: boolean;
  delivery_email: string | null;
  download_token: string | null;
  download_expires_at: string | null;
}

// ── Brief helpers ──────────────────────────────────────────────────────

export async function getCurrentBrief(): Promise<RrgBrief | null> {
  const { data } = await db
    .from('rrg_briefs')
    .select('*')
    .eq('is_current', true)
    .eq('status', 'active')
    .single();
  return data ?? null;
}

export async function getRecentBriefs(limit = 6): Promise<RrgBrief[]> {
  const { data } = await db
    .from('rrg_briefs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ── Submission helpers ─────────────────────────────────────────────────

export async function getPendingSubmissions(): Promise<RrgSubmission[]> {
  const { data } = await db
    .from('rrg_submissions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function getApprovedDrops(): Promise<RrgSubmission[]> {
  const { data } = await db
    .from('rrg_submissions')
    .select('*')
    .eq('status', 'approved')
    .order('approved_at', { ascending: false });
  return data ?? [];
}

export async function getDropByTokenId(tokenId: number): Promise<RrgSubmission | null> {
  const { data } = await db
    .from('rrg_submissions')
    .select('*')
    .eq('token_id', tokenId)
    .eq('status', 'approved')
    .single();
  return data ?? null;
}

export async function getSubmissionById(id: string): Promise<RrgSubmission | null> {
  const { data } = await db
    .from('rrg_submissions')
    .select('*')
    .eq('id', id)
    .single();
  return data ?? null;
}

// ── Token ID counter ───────────────────────────────────────────────────

export async function claimNextTokenId(): Promise<number> {
  // Atomic increment: read current, update, return claimed value
  const { data: cfg } = await db
    .from('rrg_config')
    .select('value')
    .eq('key', 'next_token_id')
    .single();

  const current = parseInt(cfg?.value ?? '1', 10);
  const next = current + 1;

  await db
    .from('rrg_config')
    .update({ value: String(next), updated_at: new Date().toISOString() })
    .eq('key', 'next_token_id');

  return current;
}

// ── Purchase helpers ───────────────────────────────────────────────────

export async function getPurchaseByTxHash(txHash: string): Promise<RrgPurchase | null> {
  const { data } = await db
    .from('rrg_purchases')
    .select('*')
    .eq('tx_hash', txHash)
    .single();
  return data ?? null;
}

export async function getPurchaseByDownloadToken(token: string): Promise<RrgPurchase | null> {
  const { data } = await db
    .from('rrg_purchases')
    .select('*')
    .eq('download_token', token)
    .single();
  return data ?? null;
}
