'use client';

/**
 * ReferralCapture — Invisible client component for drop pages.
 *
 * When a drop page loads with ?ref=xxx:
 *   1. Sets a first-party cookie `rrg_ref` (30-day TTL, first-touch only)
 *   2. Stores in localStorage as fallback
 *   3. Fires a click tracking POST to /api/rrg/referral/click
 *
 * Renders nothing visible.
 */

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface Props {
  tokenId: number;
}

const COOKIE_NAME = 'rrg_ref';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
const LS_KEY = 'rrg_ref';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, maxAge: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

export default function ReferralCapture({ tokenId }: Props) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (!ref || ref.length < 4 || ref.length > 16) return;

    // First-touch: don't overwrite existing referral
    const existing = getCookie(COOKIE_NAME);
    if (existing) return;

    // Set cookie + localStorage
    setCookie(COOKIE_NAME, ref, COOKIE_MAX_AGE);
    try {
      localStorage.setItem(LS_KEY, ref);
    } catch {
      // localStorage may be blocked
    }

    // Fire click tracking (non-blocking)
    fetch('/api/rrg/referral/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referralCode: ref, tokenId: String(tokenId) }),
    }).catch(() => {});
  }, [searchParams, tokenId]);

  return null;
}
