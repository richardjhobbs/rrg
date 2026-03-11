import { NextRequest, NextResponse } from 'next/server';
import { requireBrandAuth } from '@/lib/rrg/brand-auth';
import { getBrandById } from '@/lib/rrg/db';
import { getSignedUrl } from '@/lib/rrg/storage';

export const dynamic = 'force-dynamic';

// GET /api/brand/[brandId]/image?type=logo|banner — redirect to signed URL
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> }
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  const type = req.nextUrl.searchParams.get('type');
  if (type !== 'logo' && type !== 'banner') {
    return NextResponse.json({ error: 'type must be logo or banner' }, { status: 400 });
  }

  try {
    const brand = await getBrandById(brandId);
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    const path = type === 'logo' ? brand.logo_path : brand.banner_path;
    if (!path) {
      return new NextResponse(null, { status: 204 });
    }

    const signedUrl = await getSignedUrl(path, 3600);
    return NextResponse.redirect(signedUrl);
  } catch (err) {
    console.error('[/api/brand/[brandId]/image GET]', err);
    return NextResponse.json({ error: 'Failed to get image' }, { status: 500 });
  }
}
