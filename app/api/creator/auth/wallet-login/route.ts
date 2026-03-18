import { NextRequest, NextResponse } from 'next/server';
import { setBrandAuthCookies, supabaseAdmin } from '@/lib/rrg/brand-auth';
import { getCreatorProfile } from '@/lib/rrg/creator-auth';
import { db } from '@/lib/rrg/db';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
);

/**
 * POST /api/creator/auth/wallet-login
 *
 * Login via thirdweb wallet — used when the user authenticates with Google
 * via thirdweb and we get their wallet address + email.
 *
 * Looks up the creator membership by wallet, verifies the email matches
 * the Supabase user, and creates a session.
 */
export async function POST(req: NextRequest) {
  try {
    const { wallet, email } = await req.json();

    if (!wallet || !email) {
      return NextResponse.json({ error: 'Wallet and email required' }, { status: 400 });
    }

    const walletLower = wallet.toLowerCase();

    // Find creator membership by wallet
    const { data: member, error: memberErr } = await db
      .from('rrg_creator_members')
      .select('user_id')
      .eq('wallet_address', walletLower)
      .maybeSingle();

    if (memberErr || !member) {
      return NextResponse.json(
        { error: 'No creator account found for this wallet. Please register first.' },
        { status: 403 },
      );
    }

    // Get the full profile
    const profile = await getCreatorProfile(member.user_id);
    if (!profile) {
      return NextResponse.json({ error: 'Creator profile not found' }, { status: 403 });
    }

    // Get the Supabase user to verify email matches
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
    if (userErr || !user) {
      return NextResponse.json({ error: 'Auth user not found' }, { status: 500 });
    }

    // Verify email matches (case-insensitive)
    if (user.email?.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Email does not match the account on file. Please use the email you registered with.' },
        { status: 403 },
      );
    }

    // Create a session: set temp password via admin, sign in to get tokens
    const tempPassword = randomBytes(32).toString('base64url');
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(member.user_id, {
      password: tempPassword,
    });
    if (updateErr) {
      console.error('[wallet-login] failed to set temp password:', updateErr);
      return NextResponse.json({ error: 'Session creation failed' }, { status: 500 });
    }

    const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: tempPassword,
    });

    if (signInErr || !signIn.session) {
      console.error('[wallet-login] sign-in failed:', signInErr);
      return NextResponse.json({ error: 'Session creation failed' }, { status: 500 });
    }

    profile.email = user.email ?? '';

    const response = NextResponse.json({
      user: { id: user.id, email: user.email },
      profile,
    });

    setBrandAuthCookies(response, signIn.session.access_token, signIn.session.refresh_token);
    return response;
  } catch (err) {
    console.error('[/api/creator/auth/wallet-login]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
