import { NextRequest, NextResponse } from 'next/server';
import { setBrandAuthCookies, supabaseAdmin } from '@/lib/rrg/brand-auth';
import { db } from '@/lib/rrg/db';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
);

// POST /api/creator/auth/register — create creator account
// Supports two flows:
//   1. OAuth registration: { email, wallet, displayName, creatorType, oauthRegistration: true }
//      — No password needed. Server generates random internal password. User logs in via Google OAuth.
//   2. Legacy email/password: { email, password, wallet, displayName, creatorType }
export async function POST(req: NextRequest) {
  try {
    const { email, password, wallet, displayName, creatorType, oauthRegistration } = await req.json();

    const isOAuth = oauthRegistration === true;

    if (!email || !wallet || !displayName?.trim()) {
      return NextResponse.json(
        { error: 'Email, wallet address, and display name are required' },
        { status: 400 },
      );
    }

    if (!isOAuth && (!password || password.length < 8)) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Validate wallet address
    if (!ethers.isAddress(wallet)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const walletLower = wallet.toLowerCase();
    const type = creatorType === 'agent' ? 'agent' : 'human';

    // Check if wallet already registered
    const { data: existing } = await db
      .from('rrg_creator_members')
      .select('id')
      .eq('wallet_address', walletLower)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'This wallet is already registered' }, { status: 409 });
    }

    // For OAuth registration, generate a random internal password (user never sees it).
    // Supabase needs a password for the user record, but the user will always log in via Google OAuth.
    const effectivePassword = isOAuth
      ? randomBytes(32).toString('base64url')
      : password;

    // Create Supabase Auth user via admin API (bypasses email confirmation)
    // then sign in with anon client to get session tokens
    let userId: string;
    let accessToken: string;
    let refreshToken: string;

    // Try admin create first
    const { data: adminUser, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: effectivePassword,
      email_confirm: true, // auto-confirm the email
      user_metadata: { creator_wallet: walletLower },
    });

    if (adminErr) {
      if (isOAuth) {
        // For OAuth: user may already exist (e.g. from brand registration).
        // Look up existing user and create a session for them.
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
        const existingUser = users?.find((u) => u.email === email);
        if (!existingUser) {
          return NextResponse.json(
            { error: 'Could not create account. Please try again or use email/password registration.' },
            { status: 409 },
          );
        }
        userId = existingUser.id;

        // Check if they already have a creator membership
        const { data: existingMember } = await db
          .from('rrg_creator_members')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (existingMember) {
          return NextResponse.json(
            { error: 'An account already exists for this email. Please use Login instead.' },
            { status: 409 },
          );
        }

        // Generate session tokens: set a temp password via admin, then sign in
        const tempPassword = randomBytes(32).toString('base64url');
        await supabaseAdmin.auth.admin.updateUserById(existingUser.id, { password: tempPassword });
        const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password: tempPassword,
        });
        if (signInErr || !signIn.session) {
          return NextResponse.json({ error: 'Account exists but session creation failed' }, { status: 500 });
        }
        accessToken  = signIn.session.access_token;
        refreshToken = signIn.session.refresh_token;
      } else {
        // Legacy: user exists, try sign in with provided password
        const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr || !signIn.session) {
          return NextResponse.json(
            { error: 'An account with this email already exists. Please use the Login tab with your existing password.' },
            { status: 409 },
          );
        }
        userId       = signIn.user.id;
        accessToken  = signIn.session.access_token;
        refreshToken = signIn.session.refresh_token;
      }
    } else {
      // User created — now sign in to get session tokens
      userId = adminUser.user.id;
      const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: effectivePassword,
      });
      if (signInErr || !signIn.session) {
        return NextResponse.json({ error: 'Account created but sign-in failed' }, { status: 500 });
      }
      accessToken  = signIn.session.access_token;
      refreshToken = signIn.session.refresh_token;
    }

    // Insert creator membership
    const { error: memberErr } = await db
      .from('rrg_creator_members')
      .insert({
        user_id:        userId,
        wallet_address: walletLower,
        display_name:   displayName || null,
        creator_type:   type,
      });

    if (memberErr) {
      console.error('[creator/register] member insert failed:', memberErr);
      return NextResponse.json({ error: 'Failed to create creator record' }, { status: 500 });
    }

    // Upsert contributor record
    await db
      .from('rrg_contributors')
      .upsert({
        wallet_address:    walletLower,
        creator_type:      type,
        display_name:      displayName || null,
        email,
        total_submissions: 0,
        total_approved:    0,
        total_rejected:    0,
        total_revenue_usdc: '0',
      }, { onConflict: 'wallet_address' });

    const response = NextResponse.json({
      user: { id: userId, email },
      profile: {
        walletAddress: walletLower,
        displayName:   displayName || null,
        creatorType:   type,
        email,
        createdAt:     new Date().toISOString(),
      },
    });

    setBrandAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch (err) {
    console.error('[/api/creator/auth/register]', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
