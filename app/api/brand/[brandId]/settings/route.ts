import { NextRequest, NextResponse } from 'next/server';
import { requireBrandAuth } from '@/lib/rrg/brand-auth';
import { getBrandById, db } from '@/lib/rrg/db';
import { uploadSubmissionFile } from '@/lib/rrg/storage';

export const dynamic = 'force-dynamic';

// Detect JPEG/PNG from magic bytes
function detectImageFormat(buf: Buffer): { ext: string; mimeType: string } | null {
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF)
    return { ext: 'jpg', mimeType: 'image/jpeg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47)
    return { ext: 'png', mimeType: 'image/png' };
  return null;
}

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB for brand images

// GET /api/brand/[brandId]/settings — get brand profile
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const brand = await getBrandById(brandId);
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }
    return NextResponse.json({ brand });
  } catch (err) {
    console.error('[/api/brand/[brandId]/settings GET]', err);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// PATCH /api/brand/[brandId]/settings — update limited brand profile fields
// Accepts JSON or multipart/form-data (when images are included)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const contentType = req.headers.get('content-type') || '';
    const isFormData = contentType.includes('multipart/form-data');

    let textFields: Record<string, unknown> = {};
    let logoFile: File | null = null;
    let bannerFile: File | null = null;

    if (isFormData) {
      const fd = await req.formData();
      // Extract text fields
      for (const key of ['name', 'description', 'headline', 'website_url', 'contact_email']) {
        const val = fd.get(key);
        if (val !== null && typeof val === 'string') {
          textFields[key] = val;
        }
      }
      // social_links comes as JSON string
      const socialStr = fd.get('social_links');
      if (socialStr && typeof socialStr === 'string') {
        try {
          textFields['social_links'] = JSON.parse(socialStr);
        } catch { /* ignore malformed JSON */ }
      }
      // Image files
      const logo = fd.get('logo');
      if (logo instanceof File && logo.size > 0) logoFile = logo;
      const banner = fd.get('banner');
      if (banner instanceof File && banner.size > 0) bannerFile = banner;
    } else {
      const body = await req.json();
      textFields = body;
    }

    // Build DB updates from allowed text fields
    const updates: Record<string, unknown> = {};
    const allowed = ['name', 'description', 'headline', 'website_url', 'social_links', 'contact_email'];

    for (const key of allowed) {
      if (textFields[key] !== undefined) {
        updates[key] = textFields[key];
      }
    }

    // Handle logo upload
    if (logoFile) {
      if (logoFile.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: 'Logo must be under 2 MB' }, { status: 400 });
      }
      const buf = Buffer.from(await logoFile.arrayBuffer());
      const fmt = detectImageFormat(buf);
      if (!fmt) {
        return NextResponse.json({ error: 'Logo must be JPEG or PNG' }, { status: 400 });
      }
      const path = `brands/${brandId}/logo.${fmt.ext}`;
      // Upsert: delete old then upload (storage.upload doesn't allow overwrite by default)
      await db.storage.from('rrg-submissions').remove([`brands/${brandId}/logo.jpg`, `brands/${brandId}/logo.png`]);
      await uploadSubmissionFile(path, buf, fmt.mimeType);
      updates['logo_path'] = path;
    }

    // Handle banner upload
    if (bannerFile) {
      if (bannerFile.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: 'Banner must be under 2 MB' }, { status: 400 });
      }
      const buf = Buffer.from(await bannerFile.arrayBuffer());
      const fmt = detectImageFormat(buf);
      if (!fmt) {
        return NextResponse.json({ error: 'Banner must be JPEG or PNG' }, { status: 400 });
      }
      const path = `brands/${brandId}/banner.${fmt.ext}`;
      await db.storage.from('rrg-submissions').remove([`brands/${brandId}/banner.jpg`, `brands/${brandId}/banner.png`]);
      await uploadSubmissionFile(path, buf, fmt.mimeType);
      updates['banner_path'] = path;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await db
      .from('rrg_brands')
      .update(updates)
      .eq('id', brandId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ brand: data });
  } catch (err) {
    console.error('[/api/brand/[brandId]/settings PATCH]', err);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
