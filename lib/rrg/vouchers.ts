/**
 * RRG Voucher System — core library
 *
 * Handles voucher code generation, HMAC-signed redemption tokens,
 * creation on purchase, redemption, and expiry.
 */

import { randomBytes, createHmac } from 'crypto';
import { db, getCurrentNetwork } from './db';

// ── Constants ────────────────────────────────────────────────────────────

const HMAC_SECRET = process.env.VOUCHER_HMAC_SECRET ?? '';
const CODE_CHARS  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

// ── Types ────────────────────────────────────────────────────────────────

export interface VoucherTemplate {
  id: string;
  brand_id: string;
  title: string;
  description: string | null;
  voucher_type: 'percentage_discount' | 'fixed_discount' | 'free_item' | 'experience' | 'custom';
  voucher_value: Record<string, unknown> | null;
  terms: string | null;
  brand_url: string | null;
  product_tags: string[] | null;
  valid_days: number;
  max_uses: number;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
}

export interface Voucher {
  id: string;
  template_id: string;
  purchase_id: string;
  submission_id: string;
  brand_id: string;
  code: string;
  redemption_token: string;
  buyer_wallet: string;
  status: 'active' | 'redeemed' | 'expired' | 'cancelled';
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_by: string | null;
  redeemed_ip: string | null;
  network: string;
  created_at: string;
}

export interface CreateVoucherInput {
  templateId: string;
  purchaseId: string;
  submissionId: string;
  brandId: string;
  buyerWallet: string;
}

export interface RedeemResult {
  success: boolean;
  error?: string;
  voucher?: Voucher;
}

// ── Code Generation ──────────────────────────────────────────────────────

/** Generate a human-readable voucher code: RRG-XXXX-XXXX */
export function generateVoucherCode(): string {
  const segment = (len: number) => {
    const bytes = randomBytes(len);
    let result = '';
    for (let i = 0; i < len; i++) {
      result += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    }
    return result;
  };
  return `RRG-${segment(4)}-${segment(4)}`;
}

/** Generate HMAC-SHA256 redemption token for a voucher ID */
export function generateRedemptionToken(voucherId: string): string {
  if (!HMAC_SECRET) throw new Error('VOUCHER_HMAC_SECRET not configured');
  return createHmac('sha256', HMAC_SECRET).update(voucherId).digest('hex');
}

// ── Template Queries ─────────────────────────────────────────────────────

export async function getTemplateById(templateId: string): Promise<VoucherTemplate | null> {
  const { data, error } = await db
    .from('rrg_voucher_templates')
    .select('*')
    .eq('id', templateId)
    .single();
  if (error || !data) return null;
  return data as VoucherTemplate;
}

export async function getTemplatesByBrand(brandId: string): Promise<VoucherTemplate[]> {
  const { data, error } = await db
    .from('rrg_voucher_templates')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VoucherTemplate[];
}

export async function getActiveTemplatesByBrand(brandId: string): Promise<VoucherTemplate[]> {
  const { data, error } = await db
    .from('rrg_voucher_templates')
    .select('*')
    .eq('brand_id', brandId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VoucherTemplate[];
}

// ── Template CRUD ────────────────────────────────────────────────────────

export interface CreateTemplateInput {
  brandId: string;
  title: string;
  description?: string | null;
  voucher_type: VoucherTemplate['voucher_type'];
  voucher_value?: Record<string, unknown> | null;
  terms?: string | null;
  brand_url?: string | null;
  product_tags?: string[] | null;
  valid_days?: number;
  max_uses?: number;
}

/** Create a new voucher template for a brand. */
export async function createTemplate(input: CreateTemplateInput): Promise<VoucherTemplate> {
  const { data, error } = await db
    .from('rrg_voucher_templates')
    .insert({
      brand_id:     input.brandId,
      title:        input.title,
      description:  input.description ?? null,
      voucher_type: input.voucher_type,
      voucher_value: input.voucher_value ?? null,
      terms:        input.terms ?? null,
      brand_url:    input.brand_url ?? null,
      product_tags: input.product_tags ?? null,
      valid_days:   input.valid_days ?? 30,
      max_uses:     input.max_uses ?? 1,
      status:       'active',
    })
    .select()
    .single();
  if (error) throw error;
  return data as VoucherTemplate;
}

/** Update a voucher template's status or fields. */
export async function updateTemplate(
  templateId: string,
  updates: Partial<Pick<VoucherTemplate, 'title' | 'description' | 'terms' | 'brand_url' | 'valid_days' | 'max_uses' | 'status'>>
): Promise<VoucherTemplate> {
  const { data, error } = await db
    .from('rrg_voucher_templates')
    .update(updates)
    .eq('id', templateId)
    .select()
    .single();
  if (error) throw error;
  return data as VoucherTemplate;
}

// ── Voucher CRUD ─────────────────────────────────────────────────────────

/**
 * Create a voucher after a purchase.
 * Called from confirm/claim routes when submission.has_voucher is true.
 */
export async function createVoucher(input: CreateVoucherInput): Promise<Voucher> {
  const template = await getTemplateById(input.templateId);
  if (!template) throw new Error(`Voucher template ${input.templateId} not found`);
  if (template.status !== 'active') throw new Error(`Voucher template ${input.templateId} is not active`);

  const code = generateVoucherCode();
  const voucherId = crypto.randomUUID();
  const redemptionToken = generateRedemptionToken(voucherId);
  const expiresAt = new Date(Date.now() + template.valid_days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from('rrg_vouchers')
    .insert({
      id:               voucherId,
      template_id:      input.templateId,
      purchase_id:      input.purchaseId,
      submission_id:    input.submissionId,
      brand_id:         input.brandId,
      code,
      redemption_token: redemptionToken,
      buyer_wallet:     input.buyerWallet.toLowerCase(),
      status:           'active',
      expires_at:       expiresAt,
      network:          getCurrentNetwork(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as Voucher;
}

/** Look up a voucher by its human-readable code */
export async function getVoucherByCode(code: string): Promise<Voucher | null> {
  const { data, error } = await db
    .from('rrg_vouchers')
    .select('*')
    .eq('code', code.toUpperCase().trim())
    .single();
  if (error || !data) return null;
  return data as Voucher;
}

/** Look up a voucher by its HMAC redemption token (QR/URL validation) */
export async function getVoucherByRedemptionToken(token: string): Promise<Voucher | null> {
  const { data, error } = await db
    .from('rrg_vouchers')
    .select('*')
    .eq('redemption_token', token)
    .single();
  if (error || !data) return null;
  return data as Voucher;
}

/** Get all vouchers for a specific purchase */
export async function getVouchersByPurchase(purchaseId: string): Promise<Voucher[]> {
  const { data, error } = await db
    .from('rrg_vouchers')
    .select('*')
    .eq('purchase_id', purchaseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Voucher[];
}

/** Brand admin: list all vouchers issued for this brand */
export async function getVouchersByBrand(brandId: string): Promise<Voucher[]> {
  const { data, error } = await db
    .from('rrg_vouchers')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Voucher[];
}

/** Aggregate voucher stats for a brand */
export async function getVoucherStats(brandId: string): Promise<{
  total: number;
  active: number;
  redeemed: number;
  expired: number;
}> {
  const { data, error } = await db
    .from('rrg_vouchers')
    .select('status')
    .eq('brand_id', brandId);

  if (error) throw error;
  const vouchers = data ?? [];

  return {
    total:    vouchers.length,
    active:   vouchers.filter(v => v.status === 'active').length,
    redeemed: vouchers.filter(v => v.status === 'redeemed').length,
    expired:  vouchers.filter(v => v.status === 'expired').length,
  };
}

// ── Redemption ───────────────────────────────────────────────────────────

/**
 * Redeem a voucher by code.
 * Validates status and expiry before marking redeemed.
 */
export async function redeemVoucher(
  code: string,
  redeemedBy: string,
  ip: string
): Promise<RedeemResult> {
  const voucher = await getVoucherByCode(code);
  if (!voucher) return { success: false, error: 'not_found' };
  if (voucher.status === 'redeemed') return { success: false, error: 'already_redeemed' };
  if (voucher.status === 'expired') return { success: false, error: 'expired' };
  if (voucher.status === 'cancelled') return { success: false, error: 'cancelled' };

  // Check expiry (belt and suspenders — status may not have been updated yet)
  if (new Date(voucher.expires_at) < new Date()) {
    // Mark expired in DB
    await db
      .from('rrg_vouchers')
      .update({ status: 'expired' })
      .eq('id', voucher.id);
    return { success: false, error: 'expired' };
  }

  const { data, error } = await db
    .from('rrg_vouchers')
    .update({
      status:      'redeemed',
      redeemed_at: new Date().toISOString(),
      redeemed_by: redeemedBy,
      redeemed_ip: ip,
    })
    .eq('id', voucher.id)
    .eq('status', 'active') // optimistic lock
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: 'redemption_failed' };
  }

  return { success: true, voucher: data as Voucher };
}

// ── Expiry ───────────────────────────────────────────────────────────────

/** Batch-expire overdue vouchers. Returns count of expired. */
export async function expireOverdueVouchers(): Promise<number> {
  const { data, error } = await db
    .from('rrg_vouchers')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

// ── Helpers for purchase flow ────────────────────────────────────────────

/**
 * Format voucher details for display in download page / email / MCP response.
 * Returns null if template not found.
 */
export async function formatVoucherForDisplay(voucher: Voucher): Promise<{
  code: string;
  brand_url: string | null;
  offer: string;
  terms: string | null;
  expires_at: string;
  redemption_url: string;
} | null> {
  const template = await getTemplateById(voucher.template_id);
  if (!template) return null;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realrealgenuine.com';

  // Build human-readable offer string
  let offer = template.title;
  if (template.voucher_type === 'percentage_discount' && template.voucher_value) {
    const pct = (template.voucher_value as { percent?: number }).percent;
    if (pct) offer = `${pct}% off`;
  } else if (template.voucher_type === 'fixed_discount' && template.voucher_value) {
    const amt = (template.voucher_value as { amount?: number; currency?: string }).amount;
    const cur = (template.voucher_value as { amount?: number; currency?: string }).currency ?? 'USD';
    if (amt) offer = `${cur} ${amt} off`;
  }

  return {
    code:           voucher.code,
    brand_url:      template.brand_url,
    offer,
    terms:          template.terms,
    expires_at:     voucher.expires_at,
    redemption_url: `${siteUrl}/voucher/redeem/${voucher.redemption_token}`,
  };
}
