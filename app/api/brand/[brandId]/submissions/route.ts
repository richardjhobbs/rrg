import { NextRequest, NextResponse } from 'next/server';
import { getPendingSubmissions } from '@/lib/rrg/db';
import { requireBrandAuth } from '@/lib/rrg/brand-auth';
import { getSignedUrl } from '@/lib/rrg/storage';

export const dynamic = 'force-dynamic';

// GET /api/brand/[brandId]/submissions — brand admin: pending submissions with signed preview URLs
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const { brandId } = await params;
  const auth = await requireBrandAuth(brandId);
  if ('error' in auth) return auth.error;

  try {
    const submissions = await getPendingSubmissions(brandId);

    // Attach signed preview URLs (1-hour for admin view)
    const withUrls = await Promise.all(
      submissions.map(async (s) => {
        let previewUrl: string | null = null;
        try {
          if (s.jpeg_storage_path) {
            previewUrl = await getSignedUrl(s.jpeg_storage_path, 3600);
          }
        } catch {
          // non-fatal
        }
        return { ...s, previewUrl };
      }),
    );

    return NextResponse.json({ submissions: withUrls });
  } catch (err) {
    console.error(`[/api/brand/${brandId}/submissions]`, err);
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 });
  }
}
