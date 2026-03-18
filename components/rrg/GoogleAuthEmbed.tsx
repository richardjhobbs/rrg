'use client';

/**
 * GoogleAuthEmbed — Single-click Google authentication via thirdweb.
 *
 * Shows a thirdweb ConnectEmbed pre-configured for Google-only auth.
 * On successful auth, extracts the wallet address and email, then calls
 * `onAuthenticated(wallet, email)`.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectEmbed, useActiveAccount, useProfiles } from 'thirdweb/react';
import { base } from 'thirdweb/chains';
import { inAppWallet } from 'thirdweb/wallets';
import { thirdwebClient } from '@/lib/rrg/thirdwebClient';

interface Props {
  onAuthenticated: (wallet: string, email: string) => void;
  buttonLabel?: string;
}

const wallets = [
  inAppWallet({
    auth: {
      options: ['google'],
    },
  }),
];

export default function GoogleAuthEmbed({ onAuthenticated, buttonLabel }: Props) {
  const account = useActiveAccount();
  const { data: profiles, isLoading: profilesLoading } = useProfiles({ client: thirdwebClient });
  const firedRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);

  // Stable ref for the callback to avoid re-triggering effects
  const onAuthRef = useRef(onAuthenticated);
  onAuthRef.current = onAuthenticated;

  // Extract email from profiles
  const extractEmail = useCallback((): string | null => {
    if (!profiles || profiles.length === 0) return null;
    for (const p of profiles) {
      // Check details.email (Google/Apple profiles)
      if (p.details?.email) return p.details.email;
    }
    return null;
  }, [profiles]);

  // Main effect: fire onAuthenticated when we have both wallet and email
  useEffect(() => {
    if (firedRef.current) return;
    if (!account?.address) return;

    const email = extractEmail();
    console.log('[GoogleAuthEmbed] account:', account.address, 'profiles:', profiles, 'email:', email);

    if (email) {
      firedRef.current = true;
      onAuthRef.current(account.address, email);
      return;
    }

    // Profiles not loaded yet — retry up to 10 times (5 seconds total)
    if (!profilesLoading && retryCount < 10) {
      const timer = setTimeout(() => setRetryCount((c) => c + 1), 500);
      return () => clearTimeout(timer);
    }
  }, [account?.address, profiles, profilesLoading, extractEmail, retryCount]);

  // Already connected — show processing state
  if (account?.address) {
    const email = extractEmail();
    return (
      <div className="space-y-2 py-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm font-mono text-white/50">
            {email ? 'Connected — processing…' : 'Connected — loading profile…'}
          </span>
        </div>
        {retryCount >= 10 && !email && (
          <p className="text-sm font-mono text-red-400">
            Could not retrieve email from Google. Please try refreshing the page.
          </p>
        )}
      </div>
    );
  }

  return (
    <ConnectEmbed
      client={thirdwebClient}
      wallets={wallets}
      chain={base}
      theme="dark"
      showThirdwebBranding={false}
      header={{ title: buttonLabel || 'Continue with Google', titleIcon: '' }}
    />
  );
}
