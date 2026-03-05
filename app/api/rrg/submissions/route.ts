import { NextResponse } from 'next/server';
import { getPendingSubmissions } from '@/lib/rrg/db';
import { isAdminFromCookies, adminUnauthorized } from '@/lib/rrg/auth';
import { getSignedUrl } from '@/lib/rrg/storage';

export const dynamic = 'force-dynamic';

// GET /api/rrg/submissions — admin only: pending submissions with signed preview URLs
export async function GET() {
  if (!(await isAdminFromCookies())) return adminUnauthorized();

  try {
    const submissions = await getPendingSubmissions();

    // Attach signed preview URLs (1-hour for admin view)
    const withUrls = await Promise.all(
      submissions.map(async (s) => {
        let previewUrl: string | null = null;
        try {
          previewUrl = await getSignedUrl(s.jpeg_storage_path, 3600);
        } catch {
          // non-fatal
        }
        return { ...s, previewUrl };
      })
    );

    return NextResponse.json({ submissions: withUrls });
  } catch (err) {
    console.error('[/api/rrg/submissions]', err);
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 });
  }
}
