import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';

export const dynamic = 'force-dynamic';

// PATCH /api/rrg/admin/brands/[brandId] — update brand settings (super-admin only)
// Supports JSON body OR multipart/form-data (for image uploads)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const { brandId } = await params;
    const contentType = req.headers.get('content-type') || '';
    const updates: Record<string, unknown> = {};

    const allowed = [
      'name', 'slug', 'description', 'headline', 'logo_path', 'banner_path',
      'website_url', 'social_links', 'contact_email', 'wallet_address',
      'status', 'max_self_listings',
    ];

    let logoFile: File | null = null;
    let bannerFile: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();

      // Extract text fields
      for (const key of allowed) {
        const val = formData.get(key);
        if (val !== null && typeof val === 'string') {
          if (key === 'social_links') {
            try { updates[key] = JSON.parse(val); } catch { /* skip */ }
          } else if (key === 'max_self_listings') {
            const n = parseInt(val, 10);
            if (!isNaN(n)) updates[key] = n;
          } else {
            updates[key] = val || null;
          }
        }
      }

      // Extract image files
      const logo = formData.get('logo_file');
      const banner = formData.get('banner_file');
      if (logo instanceof File && logo.size > 0) logoFile = logo;
      if (banner instanceof File && banner.size > 0) bannerFile = banner;
    } else {
      const body = await req.json();
      for (const key of allowed) {
        if (body[key] !== undefined) {
          updates[key] = body[key];
        }
      }
    }

    // Upload logo image
    if (logoFile) {
      const buffer = Buffer.from(await logoFile.arrayBuffer());
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
      const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
      if (!isPng && !isJpeg) {
        return NextResponse.json({ error: 'Logo must be JPEG or PNG' }, { status: 400 });
      }
      const ext = isPng ? 'png' : 'jpeg';
      const mimeType = isPng ? 'image/png' : 'image/jpeg';
      const storagePath = `brands/${brandId}/logo.${ext}`;

      const { error: uploadErr } = await db.storage
        .from('rrg-submissions')
        .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

      if (uploadErr) throw new Error(`Logo upload failed: ${uploadErr.message}`);
      updates.logo_path = storagePath;
    }

    // Upload banner image
    if (bannerFile) {
      const buffer = Buffer.from(await bannerFile.arrayBuffer());
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
      const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
      if (!isPng && !isJpeg) {
        return NextResponse.json({ error: 'Banner must be JPEG or PNG' }, { status: 400 });
      }
      const ext = isPng ? 'png' : 'jpeg';
      const mimeType = isPng ? 'image/png' : 'image/jpeg';
      const storagePath = `brands/${brandId}/banner.${ext}`;

      const { error: uploadErr } = await db.storage
        .from('rrg-submissions')
        .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

      if (uploadErr) throw new Error(`Banner upload failed: ${uploadErr.message}`);
      updates.banner_path = storagePath;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Validate wallet if provided
    if (updates.wallet_address && !/^0x[0-9a-fA-F]{40}$/.test(updates.wallet_address as string)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const { data, error } = await db
      .from('rrg_brands')
      .update(updates)
      .eq('id', brandId)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    return NextResponse.json({ brand: data, updated: Object.keys(updates) });
  } catch (err) {
    console.error('[/api/rrg/admin/brands/[brandId]]', err);
    return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 });
  }
}
