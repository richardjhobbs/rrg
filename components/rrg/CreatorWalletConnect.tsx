'use client';

/**
 * CreatorWalletConnect — Wallet connection for creator registration.
 *
 * Two options:
 *   1. Manual wallet address entry (for users who already have a wallet)
 *   2. Create/connect via thirdweb (Google, Apple, email) — inline embed, no extra click
 *
 * Once connected, calls `onWalletConnected(address)` and optionally
 * `onEmailDetected(email)` if the user authenticated via OAuth (Google/Apple).
 */

import { useState, useEffect } from 'react';
import { ConnectEmbed, useActiveAccount, useProfiles } from 'thirdweb/react';
import { base } from 'thirdweb/chains';
import { inAppWallet, createWallet } from 'thirdweb/wallets';
import { thirdwebClient } from '@/lib/rrg/thirdwebClient';

interface Props {
  onWalletConnected: (address: string) => void;
  onEmailDetected?: (email: string) => void;
  connectedAddress?: string;
}

const wallets = [
  inAppWallet({
    auth: {
      options: ['google', 'apple', 'email'],
    },
  }),
  createWallet('io.metamask'),
  createWallet('com.coinbase.wallet'),
  createWallet('walletConnect'),
];

// Basic 0x address validation
function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export default function CreatorWalletConnect({ onWalletConnected, onEmailDetected, connectedAddress }: Props) {
  const account = useActiveAccount();
  const { data: profiles } = useProfiles({ client: thirdwebClient });
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState('');
  const [mode, setMode] = useState<'choose' | 'manual' | 'thirdweb'>('choose');

  // When a thirdweb wallet connects, propagate the address + email up
  useEffect(() => {
    if (mode === 'thirdweb' && account?.address) {
      onWalletConnected(account.address);
    }
  }, [account?.address, mode, onWalletConnected]);

  // Extract email from thirdweb profiles (Google/Apple OAuth provides it)
  useEffect(() => {
    if (profiles && profiles.length > 0 && onEmailDetected) {
      const emailProfile = profiles.find((p) => p.details?.email);
      if (emailProfile?.details?.email) {
        onEmailDetected(emailProfile.details.email);
      }
    }
  }, [profiles, onEmailDetected]);

  // ── Already connected (any method) — show confirmation ──
  if (connectedAddress) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-sm font-mono text-green-400">Wallet Set</span>
        </div>
        <p className="text-sm font-mono text-white/60 break-all">
          {connectedAddress}
        </p>
        <button
          type="button"
          onClick={() => {
            onWalletConnected('');
            setManualInput('');
            setMode('choose');
          }}
          className="text-sm font-mono text-white/40 hover:text-white/70 transition-colors underline"
        >
          Change wallet
        </button>
      </div>
    );
  }

  // ── Mode: Choose method ──
  if (mode === 'choose') {
    return (
      <div className="space-y-3">
        {/* Option 1: Enter existing wallet address */}
        <button
          type="button"
          onClick={() => setMode('manual')}
          className="w-full text-left px-4 py-3 border border-white/20 hover:border-white/50
                     transition-colors group"
        >
          <span className="text-base text-white group-hover:text-white">
            Enter wallet address
          </span>
          <span className="block text-sm font-mono text-white/40 mt-0.5">
            I already have an EVM wallet (MetaMask, Coinbase, etc.)
          </span>
        </button>

        {/* Option 2: Connect or create via thirdweb */}
        <button
          type="button"
          onClick={() => setMode('thirdweb')}
          className="w-full text-left px-4 py-3 border border-white/20 hover:border-white/50
                     transition-colors group"
        >
          <span className="text-base text-white group-hover:text-white">
            Create wallet with Google / Apple
          </span>
          <span className="block text-sm font-mono text-white/40 mt-0.5">
            Wallet created automatically — no extensions needed
          </span>
        </button>
      </div>
    );
  }

  // ── Mode: Manual address entry ──
  if (mode === 'manual') {
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={manualInput}
          onChange={(e) => {
            setManualInput(e.target.value);
            setManualError('');
          }}
          placeholder="0x..."
          className="w-full bg-transparent border border-white/20 px-4 py-3 text-base font-mono
                     focus:border-white outline-none transition-colors placeholder:text-white/30"
        />
        {manualError && (
          <p className="text-red-400 text-sm font-mono">{manualError}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const trimmed = manualInput.trim();
              if (!isValidAddress(trimmed)) {
                setManualError('Invalid wallet address. Must be a 0x address (42 characters).');
                return;
              }
              onWalletConnected(trimmed);
            }}
            className="px-4 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 transition-all"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => { setMode('choose'); setManualInput(''); setManualError(''); }}
            className="px-4 py-2 text-sm font-mono text-white/50 hover:text-white/80 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Mode: Thirdweb inline embed (no extra click needed) ──
  return (
    <div className="space-y-2">
      <ConnectEmbed
        client={thirdwebClient}
        wallets={wallets}
        chain={base}
        theme="dark"
        showThirdwebBranding={false}
        header={{ title: 'Create Wallet', titleIcon: '' }}
      />
      <button
        type="button"
        onClick={() => setMode('choose')}
        className="text-sm font-mono text-white/40 hover:text-white/70 transition-colors"
      >
        ← Back
      </button>
    </div>
  );
}
