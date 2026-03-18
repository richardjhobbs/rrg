import { NextRequest, NextResponse } from 'next/server';
import { requireBrandAuth } from '@/lib/rrg/brand-auth';
import {
  getTemplatesByBrand,
  getVouchersByBrand,
  getVoucherStats,
  createTemplate,
  updateTemplate,
  type CreateTemplateInput,
} from '@/lib/rrg/vouchers';

export const dynamic = 'force-dynamic';

// GET /api/brand/[brandId]/vouchers — list templates, issued vouchers, and stats
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const [templates, vouchers, stats] = await Promise.all([
      getTemplatesByBrand(brandId),
      getVouchersByBrand(brandId),
      getVoucherStats(brandId),
    ]);

    return NextResponse.json({ templates, vouchers, stats });
  } catch (err) {
    console.error('[/api/brand/[brandId]/vouchers GET]', err);
    return NextResponse.json({ error: 'Failed to fetch vouchers' }, { status: 500 });
  }
}

// POST /api/brand/[brandId]/vouchers — create a new voucher template
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const body = await req.json();
    const { title, description, voucher_type, voucher_value, terms, brand_url, valid_days, max_uses } = body;

    if (!title || !voucher_type) {
      return NextResponse.json({ error: 'title and voucher_type are required' }, { status: 400 });
    }

    const validTypes = ['percentage_discount', 'fixed_discount', 'free_item', 'experience', 'custom'];
    if (!validTypes.includes(voucher_type)) {
      return NextResponse.json({ error: `Invalid voucher_type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const input: CreateTemplateInput = {
      brandId,
      title,
      description: description || null,
      voucher_type,
      voucher_value: voucher_value || null,
      terms: terms || null,
      brand_url: brand_url || null,
      valid_days: valid_days ? parseInt(valid_days) : 30,
      max_uses: max_uses ? parseInt(max_uses) : 1,
    };

    const template = await createTemplate(input);
    return NextResponse.json({ template });
  } catch (err) {
    console.error('[/api/brand/[brandId]/vouchers POST]', err);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}

// PATCH /api/brand/[brandId]/vouchers — update a template (status change, edit fields)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const body = await req.json();
    const { templateId, action, ...fields } = body;

    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    // Quick action shortcuts
    if (action === 'pause') {
      const template = await updateTemplate(templateId, { status: 'paused' });
      return NextResponse.json({ template });
    }
    if (action === 'activate') {
      const template = await updateTemplate(templateId, { status: 'active' });
      return NextResponse.json({ template });
    }
    if (action === 'archive') {
      const template = await updateTemplate(templateId, { status: 'archived' });
      return NextResponse.json({ template });
    }

    // General field update
    const allowedFields = ['title', 'description', 'terms', 'brand_url', 'valid_days', 'max_uses'];
    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in fields) updates[key] = fields[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const template = await updateTemplate(templateId, updates);
    return NextResponse.json({ template });
  } catch (err) {
    console.error('[/api/brand/[brandId]/vouchers PATCH]', err);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}
