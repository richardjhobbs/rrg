import { NextResponse } from 'next/server';
import { getCreatorUser, getCreatorProfile } from '@/lib/rrg/creator-auth';

export const dynamic = 'force-dynamic';

// GET /api/creator/auth/check — validate creator session
export async function GET() {
  try {
    const user = await getCreatorUser();
    if (!user) {
      return NextResponse.json({ authenticated: false });
    }

    const profile = await getCreatorProfile(user.id);
    if (!profile) {
      return NextResponse.json({ authenticated: false, reason: 'no_creator_account' });
    }

    profile.email = user.email;

    return NextResponse.json({
      authenticated: true,
      user: { id: user.id, email: user.email },
      profile,
    });
  } catch (err) {
    console.error('[/api/creator/auth/check]', err);
    return NextResponse.json({ authenticated: false });
  }
}
