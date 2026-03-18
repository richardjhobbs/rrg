import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/rrg/db';
import { requireCreatorAuth } from '@/lib/rrg/creator-auth';

export const dynamic = 'force-dynamic';

const AVATAR_BUCKET = 'rrg-submissions'; // reuse existing bucket
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB
const AVATAR_URL_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

// ── Helper: resolve avatar storage path → signed URL ──────────────────
async function resolveAvatarUrl(avatarPath: string | null): Promise<string | null> {
  if (!avatarPath) return null;
  // If it's already a full URL (legacy), return as-is
  if (avatarPath.startsWith('http')) return avatarPath;
  // Generate a signed URL from the storage path
  const { data, error } = await db.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(avatarPath, AVATAR_URL_EXPIRY);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

// GET /api/creator/profile — get creator profile
export async function GET() {
  const auth = await requireCreatorAuth();
  if ('error' in auth) return auth.error;

  const { profile } = auth;

  // Also fetch contributor stats
  const { data: contributor } = await db
    .from('rrg_contributors')
    .select('total_submissions, total_approved, total_rejected, total_revenue_usdc, bio, brands_contributed, avatar_url')
    .eq('wallet_address', profile.walletAddress)
    .maybeSingle();

  // Resolve avatar path → signed URL
  const avatarPath = profile.avatarUrl || contributor?.avatar_url || null;
  const avatarUrl = await resolveAvatarUrl(avatarPath);

  // Override profile.avatarUrl with the resolved signed URL
  profile.avatarUrl = avatarUrl;

  return NextResponse.json({
    profile,
    stats: {
      total_submissions: contributor?.total_submissions ?? 0,
      total_approved: contributor?.total_approved ?? 0,
      total_rejected: contributor?.total_rejected ?? 0,
      total_revenue_usdc: contributor?.total_revenue_usdc ?? '0',
      bio: contributor?.bio ?? null,
      brands_contributed: contributor?.brands_contributed ?? [],
      avatar_url: avatarUrl,
    },
  });
}

// PATCH /api/creator/profile — update creator profile (JSON body)
export async function PATCH(req: NextRequest) {
  const auth = await requireCreatorAuth();
  if ('error' in auth) return auth.error;

  const { profile } = auth;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.displayName !== undefined) updates.display_name = body.displayName;

  if (Object.keys(updates).length > 0) {
    await db
      .from('rrg_creator_members')
      .update(updates)
      .eq('id', profile.id);
  }

  // Update contributor record too
  const contribUpdates: Record<string, unknown> = {};
  if (body.displayName !== undefined) contribUpdates.display_name = body.displayName;
  if (body.bio !== undefined) contribUpdates.bio = body.bio;

  if (Object.keys(contribUpdates).length > 0) {
    await db
      .from('rrg_contributors')
      .update(contribUpdates)
      .eq('wallet_address', profile.walletAddress);
  }

  return NextResponse.json({ success: true });
}

// POST /api/creator/profile — upload avatar (multipart/form-data)
export async function POST(req: NextRequest) {
  const auth = await requireCreatorAuth();
  if ('error' in auth) return auth.error;

  const { profile } = auth;

  try {
    const formData = await req.formData();
    const file = formData.get('avatar') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No avatar file provided' }, { status: 400 });
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return NextResponse.json(
        { error: `Avatar too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 2 MB.` },
        { status: 400 },
      );
    }

    // Validate image type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Avatar must be JPEG, PNG, or WebP' },
        { status: 400 },
      );
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `avatars/${profile.id}/avatar.${ext}`;

    // Upload to Supabase Storage (upsert = overwrite existing)
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await db.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('[creator/profile] Avatar upload failed:', uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 },
      );
    }

    // Store the STORAGE PATH (not a URL) — we generate signed URLs on read
    await Promise.all([
      db
        .from('rrg_creator_members')
        .update({ avatar_url: storagePath })
        .eq('id', profile.id),
      db
        .from('rrg_contributors')
        .update({ avatar_url: storagePath })
        .eq('wallet_address', profile.walletAddress),
    ]);

    // Return a signed URL for immediate display
    const avatarUrl = await resolveAvatarUrl(storagePath);

    return NextResponse.json({ success: true, avatarUrl });
  } catch (err) {
    console.error('[creator/profile] Avatar upload error:', err);
    return NextResponse.json(
      { error: 'Avatar upload failed' },
      { status: 500 },
    );
  }
}
