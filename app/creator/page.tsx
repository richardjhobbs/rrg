'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────
interface CreatorProfile {
  id: string;
  walletAddress: string;
  displayName: string | null;
  creatorType: 'human' | 'agent';
  email: string;
  createdAt: string;
}

interface Submission {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  token_id: number | null;
  edition_size: number | null;
  price_usdc: string | null;
  brand_id: string | null;
  creator_type: string;
  brandName: string;
}

interface Drop {
  id: string;
  title: string;
  token_id: number;
  edition_size: number | null;
  price_usdc: string | null;
  brand_id: string | null;
  approved_at: string;
  brandName: string;
  salesCount: number;
  salesRevenue: number;
}

interface Distribution {
  id: string;
  created_at: string;
  total_usdc: string;
  creator_usdc: string;
  brand_usdc: string;
  platform_usdc: string;
  split_type: string;
  status: string;
  notes: string | null;
  creatorTxHash: string | null;
}

interface EarningsTotals {
  totalEarned: number;
  totalPending: number;
  totalPaid: number;
  totalSales: number;
}

interface ContributorStats {
  total_submissions: number;
  total_approved: number;
  total_rejected: number;
  total_revenue_usdc: string;
  bio: string | null;
  brands_contributed: string[];
}

type Tab = 'submissions' | 'drops' | 'earnings' | 'profile';

// ── Main Page ──────────────────────────────────────────────────────────
export default function CreatorDashboard() {
  const [authed,  setAuthed]  = useState<boolean | null>(null);
  const [profile, setProfile] = useState<CreatorProfile | null>(null);

  useEffect(() => {
    fetch('/api/creator/auth/check')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.profile) {
          setAuthed(true);
          setProfile(d.profile);
        } else {
          setAuthed(false);
        }
      })
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-xs font-mono text-white/30">Loading…</p>
      </div>
    );
  }

  if (!authed || !profile) {
    return <AuthPage onLogin={(p) => { setAuthed(true); setProfile(p); }} />;
  }

  return <DashboardPage profile={profile} onLogout={() => { setAuthed(false); setProfile(null); }} />;
}

// ── Auth Page (Login + Register) ───────────────────────────────────────
function AuthPage({ onLogin }: { onLogin: (p: CreatorProfile) => void }) {
  const [mode,        setMode]        = useState<'login' | 'register'>('login');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [wallet,      setWallet]      = useState('');
  const [displayName, setDisplayName] = useState('');
  const [creatorType, setCreatorType] = useState<'human' | 'agent'>('human');
  const [err,         setErr]         = useState('');
  const [loading,     setLoading]     = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);

    const res = await fetch('/api/creator/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok && data.profile) {
      onLogin(data.profile);
    } else {
      setErr(data.error || 'Login failed');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);

    const res = await fetch('/api/creator/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, wallet, displayName, creatorType }),
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok && data.profile) {
      onLogin(data.profile);
    } else {
      setErr(data.error || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <h1 className="text-xs font-mono uppercase tracking-[0.3em] text-white/40 mb-8">
          Creator Dashboard
        </h1>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Email</label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                           focus:border-white outline-none transition-colors"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Password</label>
              <input
                type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                           focus:border-white outline-none transition-colors"
              />
            </div>
            {err && <p className="text-red-400 text-xs font-mono">{err}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full py-3 bg-white text-black text-sm font-medium hover:bg-white/90
                         disabled:opacity-40 transition-all"
            >
              {loading ? 'Logging in…' : 'Login →'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setErr(''); }}
              className="w-full text-xs text-white/30 hover:text-white/60 transition-colors font-mono"
            >
              No account? Register →
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Email</label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                           focus:border-white outline-none transition-colors"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Password (min 8 chars)</label>
              <input
                type="password" required minLength={8} value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                           focus:border-white outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Wallet Address (Base)</label>
              <input
                type="text" required value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="0x..."
                className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm font-mono
                           focus:border-white outline-none transition-colors placeholder:text-white/20"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Display Name (optional)</label>
              <input
                type="text" value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                           focus:border-white outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Creator Type</label>
              <div className="flex gap-4">
                {(['human', 'agent'] as const).map((t) => (
                  <button
                    key={t} type="button"
                    onClick={() => setCreatorType(t)}
                    className={`flex-1 py-2 text-xs font-mono uppercase border transition-all ${
                      creatorType === t
                        ? 'border-white text-white'
                        : 'border-white/20 text-white/30 hover:border-white/50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {err && <p className="text-red-400 text-xs font-mono">{err}</p>}
            <button
              type="submit" disabled={loading}
              className="w-full py-3 bg-white text-black text-sm font-medium hover:bg-white/90
                         disabled:opacity-40 transition-all"
            >
              {loading ? 'Creating account…' : 'Register →'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('login'); setErr(''); }}
              className="w-full text-xs text-white/30 hover:text-white/60 transition-colors font-mono"
            >
              ← Already have an account? Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────
function DashboardPage({
  profile,
  onLogout,
}: {
  profile: CreatorProfile;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>('submissions');

  const handleLogout = async () => {
    await fetch('/api/creator/auth/logout', { method: 'POST' });
    onLogout();
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-xs font-mono uppercase tracking-[0.3em] text-white/40 mb-1">
              Creator Dashboard
            </h1>
            <p className="text-sm text-white/60">
              {profile.displayName || profile.email}
              <span className="ml-2 px-2 py-0.5 text-[10px] font-mono uppercase border border-white/20 text-white/30">
                {profile.creatorType}
              </span>
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <a
              href="/rrg"
              className="text-xs font-mono text-white/30 hover:text-white/60 transition-colors"
            >
              Gallery
            </a>
            <button
              onClick={handleLogout}
              className="text-xs font-mono text-white/30 hover:text-red-400 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-white/10 mb-8">
          {(['submissions', 'drops', 'earnings', 'profile'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-xs font-mono uppercase tracking-widest transition-all ${
                tab === t
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'submissions' && <SubmissionsTab wallet={profile.walletAddress} />}
        {tab === 'drops'       && <DropsTab wallet={profile.walletAddress} />}
        {tab === 'earnings'    && <EarningsTab wallet={profile.walletAddress} />}
        {tab === 'profile'     && <ProfileTab profile={profile} />}
      </div>
    </div>
  );
}

// ── Submissions Tab ────────────────────────────────────────────────────
function SubmissionsTab({ wallet }: { wallet: string }) {
  const [items,   setItems]   = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/creator/submissions')
      .then((r) => r.json())
      .then((d) => setItems(d.submissions || []))
      .finally(() => setLoading(false));
  }, [wallet]);

  const statusColor = (s: string) => {
    if (s === 'approved') return 'text-green-400 border-green-400/30';
    if (s === 'rejected') return 'text-red-400 border-red-400/30';
    return 'text-amber-400 border-amber-400/30';
  };

  if (loading) return <p className="text-xs font-mono text-white/30">Loading…</p>;
  if (items.length === 0) return <p className="text-xs font-mono text-white/20">No submissions yet.</p>;

  return (
    <div className="space-y-3">
      {items.map((s) => (
        <div key={s.id} className="border border-white/10 p-4 flex justify-between items-start">
          <div>
            <h3 className="text-sm font-medium">{s.title}</h3>
            <p className="text-xs text-white/40 font-mono mt-1">
              {s.brandName} · {new Date(s.created_at).toLocaleDateString()}
              {s.token_id != null && ` · Token #${s.token_id}`}
              {s.price_usdc && ` · $${parseFloat(s.price_usdc).toFixed(2)}`}
            </p>
          </div>
          <span className={`text-[10px] font-mono uppercase px-2 py-0.5 border ${statusColor(s.status)}`}>
            {s.status}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Drops Tab ──────────────────────────────────────────────────────────
function DropsTab({ wallet }: { wallet: string }) {
  const [items,   setItems]   = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/creator/drops')
      .then((r) => r.json())
      .then((d) => setItems(d.drops || []))
      .finally(() => setLoading(false));
  }, [wallet]);

  if (loading) return <p className="text-xs font-mono text-white/30">Loading…</p>;
  if (items.length === 0) return <p className="text-xs font-mono text-white/20">No approved drops yet.</p>;

  const totalRevenue = items.reduce((sum, d) => sum + d.salesRevenue, 0);
  const totalSales   = items.reduce((sum, d) => sum + d.salesCount, 0);

  return (
    <div>
      {/* Summary */}
      <div className="mb-6 p-4 border border-white/10 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs font-mono text-white/30 mb-1">Drops</p>
          <p className="text-sm font-medium">{items.length}</p>
        </div>
        <div>
          <p className="text-xs font-mono text-white/30 mb-1">Total Sales</p>
          <p className="text-sm font-medium">{totalSales}</p>
        </div>
        <div>
          <p className="text-xs font-mono text-white/30 mb-1">Gross Revenue</p>
          <p className="text-sm font-medium text-green-400">${totalRevenue.toFixed(2)}</p>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {items.map((d) => (
          <div key={d.id} className="border border-white/10 p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-medium">
                  <a href={`/rrg/drop/${d.token_id}`} className="hover:underline">
                    {d.title}
                  </a>
                </h3>
                <p className="text-xs text-white/40 font-mono mt-1">
                  Token #{d.token_id} · {d.brandName} · ${parseFloat(d.price_usdc ?? '0').toFixed(2)}
                  · {d.edition_size ?? '∞'} editions
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-green-400">{d.salesCount} sold</p>
                <p className="text-xs text-white/40 font-mono">${d.salesRevenue.toFixed(2)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Earnings Tab ───────────────────────────────────────────────────────
function EarningsTab({ wallet }: { wallet: string }) {
  const [items,   setItems]   = useState<Distribution[]>([]);
  const [totals,  setTotals]  = useState<EarningsTotals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/creator/earnings')
      .then((r) => r.json())
      .then((d) => {
        setItems(d.distributions || []);
        setTotals(d.totals || null);
      })
      .finally(() => setLoading(false));
  }, [wallet]);

  const splitLabel = (s: string) => {
    const labels: Record<string, string> = {
      'challenge_35_35_30':  '35/35/30',
      'brand_product_70_30': '70/30',
      'rrg_challenge_35_65': '35/65',
      'legacy_70_30':        'Legacy',
    };
    return labels[s] || s;
  };

  const statusColor = (s: string) => {
    if (s === 'completed') return 'text-green-400 border-green-400/30';
    if (s === 'failed')    return 'text-red-400 border-red-400/30';
    return 'text-amber-400 border-amber-400/30';
  };

  if (loading) return <p className="text-xs font-mono text-white/30">Loading…</p>;

  return (
    <div>
      {/* Summary */}
      {totals && (
        <div className="mb-6 p-4 border border-white/10 grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs font-mono text-white/30 mb-1">Total Sales</p>
            <p className="text-sm font-medium">{totals.totalSales}</p>
          </div>
          <div>
            <p className="text-xs font-mono text-white/30 mb-1">Total Earned</p>
            <p className="text-sm font-medium text-green-400">${totals.totalEarned.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs font-mono text-white/30 mb-1">Paid Out</p>
            <p className="text-sm font-medium">${totals.totalPaid.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs font-mono text-white/30 mb-1">Pending</p>
            <p className="text-sm font-medium text-amber-400">${totals.totalPending.toFixed(2)}</p>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs font-mono text-white/20">No earnings yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((d) => (
            <div key={d.id} className="border border-white/10 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-white/40 font-mono">
                    {new Date(d.created_at).toLocaleDateString()} · {splitLabel(d.split_type)}
                  </p>
                  <p className="text-sm mt-1">
                    Your share: <span className="text-green-400 font-medium">${parseFloat(d.creator_usdc).toFixed(2)}</span>
                    <span className="text-white/30 ml-2">of ${parseFloat(d.total_usdc).toFixed(2)} total</span>
                  </p>
                  {d.creatorTxHash && d.status === 'completed' && (
                    <a
                      href={`https://basescan.org/tx/${d.creatorTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-blue-400 hover:underline mt-1 inline-block"
                    >
                      View on Basescan ↗
                    </a>
                  )}
                </div>
                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 border ${statusColor(d.status)}`}>
                  {d.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Profile Tab ────────────────────────────────────────────────────────
function ProfileTab({ profile }: { profile: CreatorProfile }) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [bio,         setBio]         = useState('');
  const [stats,       setStats]       = useState<ContributorStats | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState('');

  useEffect(() => {
    fetch('/api/creator/profile')
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats);
        if (d.stats?.bio) setBio(d.stats.bio);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    const res = await fetch('/api/creator/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, bio }),
    });

    setSaving(false);
    if (res.ok) {
      setMsg('Profile updated');
    } else {
      const data = await res.json();
      setMsg(`Error: ${data.error}`);
    }
  };

  return (
    <div className="max-w-lg">
      {/* Stats */}
      {stats && (
        <div className="mb-8 p-4 border border-white/10 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs font-mono text-white/30 mb-1">Submissions</p>
            <p className="text-sm font-medium">{stats.total_submissions}</p>
          </div>
          <div>
            <p className="text-xs font-mono text-white/30 mb-1">Approved</p>
            <p className="text-sm font-medium text-green-400">{stats.total_approved}</p>
          </div>
          <div>
            <p className="text-xs font-mono text-white/30 mb-1">Lifetime Earnings</p>
            <p className="text-sm font-medium text-green-400">
              ${parseFloat(stats.total_revenue_usdc || '0').toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mb-6 space-y-2">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-white/40">Wallet</span>
          <span className="text-white/60">{profile.walletAddress}</span>
        </div>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-white/40">Email</span>
          <span className="text-white/60">{profile.email}</span>
        </div>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-white/40">Type</span>
          <span className="text-white/60 uppercase">{profile.creatorType}</span>
        </div>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-white/40">Joined</span>
          <span className="text-white/60">{profile.createdAt ? new Date(profile.createdAt.replace(' ', 'T')).toLocaleDateString() : '—'}</span>
        </div>
      </div>

      {/* Edit Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="text-xs font-mono text-white/40 block mb-1">Display Name</label>
          <input
            type="text" value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                       focus:border-white outline-none transition-colors"
          />
        </div>
        <div>
          <label className="text-xs font-mono text-white/40 block mb-1">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            maxLength={2000}
            className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                       focus:border-white outline-none transition-colors resize-none"
          />
        </div>
        {msg && (
          <p className={`text-xs font-mono ${msg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
            {msg}
          </p>
        )}
        <button
          type="submit" disabled={saving}
          className="px-6 py-2 bg-white text-black text-sm font-medium hover:bg-white/90
                     disabled:opacity-40 transition-all"
        >
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}
