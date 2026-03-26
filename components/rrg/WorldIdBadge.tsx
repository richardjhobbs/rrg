'use client';

/**
 * WorldIdBadge
 * Shows World ID human-backed agent verification status.
 * Fetches after mount so it never blocks the main page render.
 * Renders nothing if the wallet is not verified (not an error state).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Props {
  walletAddress: string;
}

interface VerifyData {
  verified: boolean;
  humanId?: string;
  verifiedAt?: string;
}

export default function WorldIdBadge({ walletAddress }: Props) {
  const [data, setData] = useState<VerifyData | null>(null);
  const [tooltip, setTip] = useState(false);

  useEffect(() => {
    if (!walletAddress) return;
    fetch(`/api/rrg/world-verify?wallet=${encodeURIComponent(walletAddress)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ verified: false }));
  }, [walletAddress]);

  // Don't render anything while loading or if not verified
  if (!data || !data.verified) return null;

  return (
    <div className="relative inline-block">
      {/* Badge pill */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 border text-xs font-mono uppercase tracking-wider cursor-pointer select-none
                   border-cyan-500/30 text-cyan-400/80 hover:border-cyan-400/50 hover:text-cyan-300 transition-colors"
        onClick={() => setTip((t) => !t)}
        title="Human-backed agent"
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-cyan-400" />
        World ID
        <span className="text-cyan-400/50 ml-0.5">▾</span>
      </div>

      {/* Tooltip / expanded panel */}
      {tooltip && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setTip(false)} />

          {/* Panel */}
          <div className="fixed sm:absolute right-4 sm:right-0 left-4 sm:left-auto top-auto sm:top-full mt-2 z-20 sm:w-72 border border-cyan-500/20 bg-black/95 p-4 text-sm font-mono shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-cyan-400/60 uppercase tracking-widest text-xs">
                Human-Backed Agent
              </span>
              <button
                onClick={() => setTip(false)}
                className="text-white/50 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />
              <span className="text-cyan-400">
                Verified via World AgentBook
              </span>
            </div>

            <div className="space-y-1.5 text-white/60 mb-4">
              <div className="flex justify-between">
                <span>Network</span>
                <span className="text-white/80">Base</span>
              </div>
              <div className="flex justify-between">
                <span>Verified</span>
                <span className="text-white/80">
                  {data.verifiedAt
                    ? new Date(data.verifiedAt).toLocaleDateString()
                    : 'Yes'}
                </span>
              </div>
            </div>

            <p className="text-white/50 leading-relaxed mb-3 text-xs">
              This agent is registered in the on-chain AgentBook on Base,
              confirming it is operated by a verified unique human via World ID.
              Verification is optional — unverified agents can still use the
              platform normally.
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <Link
                href="https://www.agentbook.world/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400/60 hover:text-cyan-300 transition-colors"
                onClick={() => setTip(false)}
              >
                AgentBook ↗
              </Link>
              <Link
                href="https://docs.world.org/agents/agent-kit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white/80 transition-colors"
                onClick={() => setTip(false)}
              >
                World Docs ↗
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
