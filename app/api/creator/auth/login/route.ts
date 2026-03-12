import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { setBrandAuthCookies } from '@/lib/rrg/brand-auth';
import { getCreatorProfile } from '@/lib/rrg/creator-auth';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
);

// POST /api/creator/auth/login — creator email/password login
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify they have a creator membership
    const profile = await getCreatorProfile(data.user.id);
    if (!profile) {
      return NextResponse.json({ error: 'No creator account found. Please register first.' }, { status: 403 });
    }

    profile.email = data.user.email ?? '';

    const response = NextResponse.json({
      user: { id: data.user.id, email: data.user.email },
      profile,
    });

    setBrandAuthCookies(response, data.session.access_token, data.session.refresh_token);
    return response;
  } catch (err) {
    console.error('[/api/creator/auth/login]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
