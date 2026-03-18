import { NextRequest, NextResponse } from 'next/server';
import { setBrandAuthCookies } from '@/lib/rrg/brand-auth';
import { getCreatorProfile } from '@/lib/rrg/creator-auth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
);

/**
 * POST /api/creator/auth/oauth-callback
 *
 * Called by the client after an OAuth redirect lands on /creator with tokens
 * in the URL hash. Verifies the token, checks for a creator membership,
 * and sets the server-side auth cookies.
 */
export async function POST(req: NextRequest) {
  try {
    const { access_token, refresh_token } = await req.json();

    if (!access_token) {
      return NextResponse.json({ error: 'Missing access_token' }, { status: 400 });
    }

    // Verify the token
    const { data, error } = await supabaseAuth.auth.getUser(access_token);
    if (error || !data.user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Check they have a creator membership
    const profile = await getCreatorProfile(data.user.id);
    if (!profile) {
      return NextResponse.json(
        { error: 'No creator account found for this Google account. Please register first with email and password.' },
        { status: 403 },
      );
    }

    profile.email = data.user.email ?? '';

    const response = NextResponse.json({
      user: { id: data.user.id, email: data.user.email },
      profile,
    });

    setBrandAuthCookies(response, access_token, refresh_token || '');
    return response;
  } catch (err) {
    console.error('[/api/creator/auth/oauth-callback]', err);
    return NextResponse.json({ error: 'OAuth callback failed' }, { status: 500 });
  }
}
