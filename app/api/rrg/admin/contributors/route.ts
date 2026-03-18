import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/rrg/db';
import { getAllContributors, getContributorStats } from '@/lib/rrg/db';

export const dynamic = 'force-dynamic';

const AVATAR_BUCKET = 'rrg-submissions';
const AVATAR_URL_EXPIRY = 7 * 24 * 60 * 60; // 7 days

// GET /api/rrg/admin/contributors — super-admin: list all contributors + stats
export async function GET() {
  const jar = await cookies();
  const token = jar.get('rrg_admin_token')?.value;
  if (token !== process.env.RRG_ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [contributors, stats] = await Promise.all([
      getAllContributors(),
      getContributorStats(),
    ]);

    // Resolve avatar storage paths → signed URLs
    const resolved = await Promise.all(
      contributors.map(async (c) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const avatarPath = (c as any).avatar_url as string | null;
        if (avatarPath && !avatarPath.startsWith('http')) {
          const { data: signed } = await db.storage
            .from(AVATAR_BUCKET)
            .createSignedUrl(avatarPath, AVATAR_URL_EXPIRY);
          return { ...c, avatar_url: signed?.signedUrl ?? null };
        }
        return c;
      }),
    );

    return NextResponse.json({ contributors: resolved, stats });
  } catch (err) {
    console.error('[/api/rrg/admin/contributors]', err);
    return NextResponse.json({ error: 'Failed to fetch contributors' }, { status: 500 });
  }
}
