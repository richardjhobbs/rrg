'use client';

/**
 * ReferralPartnerTab — Dashboard tab for referral partners.
 *
 * Shows: opt-in button, referral code, link generator, stats, commission history.
 */

import { useState, useEffect } from 'react';

interface PartnerData {
  id: string;
  referralCode: string;
  status: string;
  commissionRate: string;
  walletAddress: string;
  totalClicks: number;
  totalConversions: number;
  totalCommissionUsdc: number;
  pendingUsdc: number;
  paidUsdc: number;
  conversionRate: number;
}

interface Commission {
  id: string;
  date: string;
  revenueUsdc: number;
  commissionUsdc: number;
  status: string;
  notes: string | null;
}

interface Drop {
  token_id: number;
  title: string;
}

export default function ReferralPartnerTab({ wallet }: { wallet: string }) {
  const [loading, setLoading]           = useState(true);
  const [registered, setRegistered]     = useState(false);
  const [partner, setPartner]           = useState<PartnerData | null>(null);
  const [linkTemplate, setLinkTemplate] = useState('');
  const [commissions, setCommissions]   = useState<Commission[]>([]);
  const [drops, setDrops]               = useState<Drop[]>([]);
  const [registering, setRegistering]   = useState(false);
  const [copied, setCopied]             = useState('');
  const [err, setErr]                   = useState('');

  // Fetch partner status
  useEffect(() => {
    Promise.all([
      fetch('/api/creator/referral').then(r => r.json()),
      fetch('/api/creator/drops').then(r => r.json()),
    ])
      .then(([refData, dropsData]) => {
        if (refData.registered) {
          setRegistered(true);
          setPartner(refData.partner);
          setLinkTemplate(refData.linkTemplate);
          setCommissions(refData.commissions || []);
        }
        setDrops((dropsData.drops || []).map((d: { token_id: number; title: string }) => ({
          token_id: d.token_id,
          title: d.title,
        })));
      })
      .finally(() => setLoading(false));
  }, [wallet]);

  const handleRegister = async () => {
    setRegistering(true);
    setErr('');
    try {
      const res = await fetch('/api/creator/referral', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.partner) {
        setRegistered(true);
        // Refresh full data
        const refRes = await fetch('/api/creator/referral');
        const refData = await refRes.json();
        if (refData.registered) {
          setPartner(refData.partner);
          setLinkTemplate(refData.linkTemplate);
          setCommissions(refData.commissions || []);
        }
      } else {
        setErr(data.error || 'Registration failed');
      }
    } catch {
      setErr('Something went wrong');
    }
    setRegistering(false);
  };

  const copyLink = (link: string, label: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const statusColor = (s: string) => {
    if (s === 'paid')     return 'text-green-400 border-green-400/30';
    if (s === 'approved') return 'text-blue-400 border-blue-400/30';
    if (s === 'rejected') return 'text-red-400 border-red-400/30';
    return 'text-amber-400 border-amber-400/30';
  };

  if (loading) return <p className="text-sm font-mono text-white/50">Loading...</p>;

  // ── Not yet registered ──
  if (!registered) {
    return (
      <div className="max-w-lg">
        <h3 className="text-base font-medium mb-4">Become a Referral Partner</h3>
        <div className="border border-white/10 p-6 space-y-4">
          <p className="text-sm text-white/70 leading-relaxed">
            Earn commission by sharing product links with your network.
            When someone purchases through your link, you earn{' '}
            <span className="text-white font-medium">10% of the platform&apos;s share</span> of the sale.
          </p>
          <ul className="text-sm text-white/60 space-y-1">
            <li>· Get a unique referral code for all your links</li>
            <li>· Share via social media, DMs, email — any channel</li>
            <li>· 30-day attribution window</li>
            <li>· Commission paid in USDC on Base</li>
            <li>· Same terms as marketing agents</li>
          </ul>
          {err && <p className="text-red-400 text-sm font-mono">{err}</p>}
          <button
            onClick={handleRegister}
            disabled={registering}
            className="w-full py-3 bg-white text-black text-base font-medium hover:bg-white/90
                       disabled:opacity-40 transition-all"
          >
            {registering ? 'Registering...' : 'Join as Referral Partner →'}
          </button>
        </div>
      </div>
    );
  }

  // ── Registered — show dashboard ──
  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="p-4 border border-white/10 grid grid-cols-5 gap-4 text-center">
        <div>
          <p className="text-sm font-mono text-white/50 mb-1">Clicks</p>
          <p className="text-base font-medium">{partner?.totalClicks ?? 0}</p>
        </div>
        <div>
          <p className="text-sm font-mono text-white/50 mb-1">Conversions</p>
          <p className="text-base font-medium">{partner?.totalConversions ?? 0}</p>
        </div>
        <div>
          <p className="text-sm font-mono text-white/50 mb-1">Conv. Rate</p>
          <p className="text-base font-medium">{partner?.conversionRate ?? 0}%</p>
        </div>
        <div>
          <p className="text-sm font-mono text-white/50 mb-1">Total Earned</p>
          <p className="text-base font-medium text-green-400">
            ${(partner?.totalCommissionUsdc ?? 0).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-sm font-mono text-white/50 mb-1">Pending</p>
          <p className="text-base font-medium text-amber-400">
            ${(partner?.pendingUsdc ?? 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Referral Code + Link Generator */}
      <div className="border border-white/10 p-6 space-y-4">
        <div>
          <p className="text-sm font-mono text-white/50 mb-1">Your Referral Code</p>
          <div className="flex items-center gap-3">
            <code className="text-lg font-mono text-white bg-white/5 px-3 py-1">
              {partner?.referralCode}
            </code>
            <button
              onClick={() => copyLink(partner?.referralCode ?? '', 'code')}
              className="text-sm font-mono text-white/50 hover:text-white transition-colors"
            >
              {copied === 'code' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div>
          <p className="text-sm font-mono text-white/50 mb-2">Generate Links</p>
          {/* Store link */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-white/60 w-24 shrink-0">Store:</span>
            <code className="text-sm font-mono text-white/70 truncate flex-1">
              {linkTemplate.replace('/drop/{tokenId}', '')}
            </code>
            <button
              onClick={() => copyLink(
                linkTemplate.replace('/drop/{tokenId}', ''),
                'store',
              )}
              className="text-sm font-mono text-white/50 hover:text-white transition-colors shrink-0"
            >
              {copied === 'store' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {/* Per-drop links */}
          {drops.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {drops.map(d => {
                const link = linkTemplate.replace('{tokenId}', String(d.token_id));
                return (
                  <div key={d.token_id} className="flex items-center gap-2">
                    <span className="text-sm text-white/60 w-24 shrink-0 truncate" title={d.title}>
                      #{d.token_id}:
                    </span>
                    <code className="text-sm font-mono text-white/70 truncate flex-1">{link}</code>
                    <button
                      onClick={() => copyLink(link, `drop-${d.token_id}`)}
                      className="text-sm font-mono text-white/50 hover:text-white transition-colors shrink-0"
                    >
                      {copied === `drop-${d.token_id}` ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-sm font-mono text-white/30">
          Commission: {partner?.commissionRate} of the platform&apos;s share · 30-day cookie · Paid in USDC
        </p>
      </div>

      {/* Commission History */}
      {commissions.length > 0 && (
        <div>
          <h3 className="text-sm font-mono uppercase tracking-[0.2em] text-white/50 mb-3">
            Commission History
          </h3>
          <div className="space-y-2">
            {commissions.map(c => (
              <div key={c.id} className="border border-white/10 p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm text-white/60 font-mono">
                    {new Date(c.date).toLocaleDateString()}
                  </p>
                  <p className="text-sm mt-0.5">
                    Platform share: ${c.revenueUsdc.toFixed(2)}
                    <span className="text-white/40 mx-1">→</span>
                    Commission: <span className="text-green-400 font-medium">${c.commissionUsdc.toFixed(2)}</span>
                  </p>
                  {c.notes && <p className="text-sm text-white/40 font-mono mt-0.5">{c.notes}</p>}
                </div>
                <span className={`text-sm font-mono uppercase px-2 py-0.5 border ${statusColor(c.status)}`}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
