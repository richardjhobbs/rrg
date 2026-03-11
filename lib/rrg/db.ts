import { createClient } from '@supabase/supabase-js';

// ── Typed DB client (server-side, uses service key) ───────────────────
export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_KEY ?? 'placeholder-key',
  { auth: { persistSession: false } }
);

// ── Constants ─────────────────────────────────────────────────────────
export const RRG_BRAND_ID = '00000000-0000-4000-8000-000000000001';

// ── Types ─────────────────────────────────────────────────────────────

export type BriefStatus = 'active' | 'closed' | 'archived';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type SubmissionChannel = 'web' | 'api' | 'telegram' | 'bluesky';
export type BuyerType = 'human' | 'agent';
export type CreatorType = 'human' | 'agent';
export type RrgNetwork = 'base';
export type BrandStatus = 'pending' | 'active' | 'suspended' | 'archived';
export type DistributionStatus = 'pending' | 'completed' | 'failed';

// ── Network helpers ────────────────────────────────────────────────────

/** Returns the network name — always 'base' (mainnet). */
export function getCurrentNetwork(): RrgNetwork {
  return 'base';
}

// ── Interfaces ────────────────────────────────────────────────────────

export interface RrgBrand {
  id: string;
  created_at: string;
  name: string;
  slug: string;
  description: string | null;
  headline: string | null;
  logo_path: string | null;
  banner_path: string | null;
  website_url: string | null;
  social_links: Record<string, string>;
  contact_email: string;
  wallet_address: string;
  status: BrandStatus;
  tc_accepted_at: string | null;
  tc_version: string | null;
  max_self_listings: number;
  self_listings_used: number;
  created_by: string | null;
}

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
  brand_id: string | null;
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
  creator_bio: string | null;
  network: RrgNetwork;
  brand_id: string | null;
  creator_type: CreatorType;
  is_brand_product: boolean;
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
  mint_status: string;
  payment_method: string;
  network: RrgNetwork;
  brand_id: string | null;
}

export interface RrgDistribution {
  id: string;
  created_at: string;
  purchase_id: string;
  brand_id: string | null;
  total_usdc: number;
  creator_usdc: number;
  brand_usdc: number;
  platform_usdc: number;
  creator_wallet: string | null;
  brand_wallet: string | null;
  split_type: string;
  status: DistributionStatus;
  notes: string | null;
}

// ── Brand helpers ─────────────────────────────────────────────────────

export async function getBrandById(id: string): Promise<RrgBrand | null> {
  const { data } = await db
    .from('rrg_brands')
    .select('*')
    .eq('id', id)
    .single();
  return data ?? null;
}

export async function getBrandBySlug(slug: string): Promise<RrgBrand | null> {
  const { data } = await db
    .from('rrg_brands')
    .select('*')
    .eq('slug', slug)
    .single();
  return data ?? null;
}

export async function getAllActiveBrands(): Promise<RrgBrand[]> {
  const { data } = await db
    .from('rrg_brands')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function getAllBrands(): Promise<RrgBrand[]> {
  const { data } = await db
    .from('rrg_brands')
    .select('*')
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function getBrandSalesStats(brandId: string): Promise<{
  totalSales: number;
  totalRevenue: number;
  pendingDistributions: number;
}> {
  // Count purchases for this brand
  const { count: totalSales } = await db
    .from('rrg_purchases')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId);

  // Sum revenue from distributions
  const { data: distData } = await db
    .from('rrg_distributions')
    .select('total_usdc, status')
    .eq('brand_id', brandId);

  let totalRevenue = 0;
  let pendingDistributions = 0;
  for (const d of distData ?? []) {
    totalRevenue += parseFloat(d.total_usdc);
    if (d.status === 'pending') pendingDistributions++;
  }

  return {
    totalSales: totalSales ?? 0,
    totalRevenue,
    pendingDistributions,
  };
}

// ── Brief helpers ──────────────────────────────────────────────────────

export async function getCurrentBrief(brandId?: string): Promise<RrgBrief | null> {
  let query = db
    .from('rrg_briefs')
    .select('*')
    .eq('is_current', true)
    .eq('status', 'active');

  if (brandId) {
    query = query.eq('brand_id', brandId);
  }

  const { data } = await query.single();
  return data ?? null;
}

export async function getRecentBriefs(limit = 6, brandId?: string): Promise<RrgBrief[]> {
  let query = db
    .from('rrg_briefs')
    .select('*');

  if (brandId) {
    query = query.eq('brand_id', brandId);
  }

  const { data } = await query
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getOpenBriefs(brandId?: string): Promise<RrgBrief[]> {
  let query = db
    .from('rrg_briefs')
    .select('*')
    .eq('status', 'active');

  if (brandId) {
    query = query.eq('brand_id', brandId);
  }

  const { data } = await query
    .order('created_at', { ascending: false });
  return data ?? [];
}

// ── Submission helpers ─────────────────────────────────────────────────

export async function getPendingSubmissions(brandId?: string): Promise<RrgSubmission[]> {
  let query = db
    .from('rrg_submissions')
    .select('*')
    .eq('status', 'pending');

  if (brandId) {
    query = query.eq('brand_id', brandId);
  }

  const { data } = await query.order('created_at', { ascending: true });
  return data ?? [];
}

export async function getApprovedDrops(brandId?: string): Promise<RrgSubmission[]> {
  let query = db
    .from('rrg_submissions')
    .select('*')
    .eq('status', 'approved')
    .eq('network', getCurrentNetwork());

  if (brandId) {
    query = query.eq('brand_id', brandId);
  }

  const { data } = await query.order('approved_at', { ascending: false });
  return data ?? [];
}

export async function getApprovedDropsPaginated(
  page: number,
  perPage: number,
  briefId?: string | null,
  brandId?: string,
): Promise<{ drops: RrgSubmission[]; totalCount: number }> {
  const offset = (page - 1) * perPage;

  let query = db
    .from('rrg_submissions')
    .select('*', { count: 'exact' })
    .eq('status', 'approved')
    .eq('network', getCurrentNetwork());

  if (briefId) {
    query = query.eq('brief_id', briefId);
  }
  if (brandId) {
    query = query.eq('brand_id', brandId);
  }

  const { data, count } = await query
    .order('approved_at', { ascending: false })
    .range(offset, offset + perPage - 1);

  return { drops: data ?? [], totalCount: count ?? 0 };
}

export async function getPurchaseCountsByTokenIds(
  tokenIds: number[],
): Promise<Map<number, number>> {
  if (tokenIds.length === 0) return new Map();

  const { data } = await db
    .from('rrg_purchases')
    .select('token_id')
    .in('token_id', tokenIds);

  const counts = new Map<number, number>();
  for (const row of data ?? []) {
    counts.set(row.token_id, (counts.get(row.token_id) ?? 0) + 1);
  }
  return counts;
}

export async function getDropByTokenId(tokenId: number): Promise<RrgSubmission | null> {
  const { data } = await db
    .from('rrg_submissions')
    .select('*')
    .eq('token_id', tokenId)
    .eq('status', 'approved')
    .eq('network', getCurrentNetwork())
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

// ── Distribution helpers ──────────────────────────────────────────────

export async function getDistributions(
  status?: DistributionStatus,
  brandId?: string,
): Promise<RrgDistribution[]> {
  let query = db
    .from('rrg_distributions')
    .select('*');

  if (status) {
    query = query.eq('status', status);
  }
  if (brandId) {
    query = query.eq('brand_id', brandId);
  }

  const { data } = await query.order('created_at', { ascending: false });
  return data ?? [];
}
