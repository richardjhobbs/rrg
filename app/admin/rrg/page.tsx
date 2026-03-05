'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────
interface Brief {
  id: string;
  title: string;
  description: string;
  ends_at?: string | null;
  is_current: boolean;
  created_at: string;
  social_caption?: string | null;
}

interface Submission {
  id: string;
  title: string;
  description?: string | null;
  creator_wallet: string;
  creator_email?: string | null;
  status: string;
  created_at: string;
  previewUrl?: string | null;
}

interface Drop {
  id: string;
  title: string;
  token_id: number;
  price_usdc: string;
  edition_size: number;
  creator_wallet: string;
  approved_at: string;
}

type Tab = 'briefs' | 'submissions' | 'drops';

// ── Main component ─────────────────────────────────────────────────────
export default function AdminPage() {
  const [authed,    setAuthed]    = useState<boolean | null>(null);
  const [password,  setPassword]  = useState('');
  const [loginErr,  setLoginErr]  = useState('');
  const [tab,       setTab]       = useState<Tab>('submissions');

  // Check auth on mount
  useEffect(() => {
    fetch('/api/rrg/admin/check')
      .then((r) => r.json())
      .then((d) => setAuthed(d.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr('');
    const res = await fetch('/api/rrg/admin/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    });
    if (res.ok) setAuthed(true);
    else        setLoginErr('Invalid password');
  };

  const handleLogout = async () => {
    await fetch('/api/rrg/admin/logout', { method: 'POST' });
    setAuthed(false);
    setPassword('');
  };

  // Loading
  if (authed === null) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="font-mono text-white/30 text-sm">Loading…</p>
      </div>
    );
  }

  // Login form
  if (!authed) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 px-6">
          <h1 className="text-xs font-mono uppercase tracking-[0.3em] text-white/40 mb-6">
            RRG Admin
          </h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                       focus:border-white outline-none transition-colors placeholder:text-white/20"
            autoFocus
          />
          {loginErr && <p className="text-red-400 text-xs font-mono">{loginErr}</p>}
          <button
            type="submit"
            className="w-full py-3 bg-white text-black text-sm font-medium hover:bg-white/90 transition-all"
          >
            Login →
          </button>
        </form>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex justify-between items-center">
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-white/60">
          RRG Admin
        </span>
        <button
          onClick={handleLogout}
          className="text-xs text-white/30 hover:text-white transition-colors font-mono"
        >
          Logout
        </button>
      </header>

      {/* Tabs */}
      <div className="border-b border-white/10 px-6 flex gap-6">
        {(['submissions', 'briefs', 'drops'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3 text-xs font-mono uppercase tracking-widest transition-colors border-b-2 -mb-px
              ${tab === t
                ? 'text-white border-white'
                : 'text-white/30 border-transparent hover:text-white/60'
              }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-6 py-8 max-w-5xl">
        {tab === 'briefs'      && <BriefTab />}
        {tab === 'submissions' && <SubmissionsTab />}
        {tab === 'drops'       && <DropsTab />}
      </div>
    </div>
  );
}

// ── Brief Tab ──────────────────────────────────────────────────────────
function BriefTab() {
  const [briefs,   setBriefs]   = useState<Brief[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [form,     setForm]     = useState({ title: '', description: '', starts_at: new Date().toISOString().split('T')[0], ends_at: '' });
  const [msg,      setMsg]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/rrg/briefs');
    const data = await res.json();
    setBriefs(data.briefs || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/rrg/brief/create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...form, is_current: true }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg('Brief created ✓');
      setForm({ title: '', description: '', starts_at: new Date().toISOString().split('T')[0], ends_at: '' });
      setCreating(false);
      load();
    } else {
      setMsg(data.error || 'Failed');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">Briefs</h2>
        <button
          onClick={() => setCreating(!creating)}
          className="text-xs border border-white/30 px-4 py-1.5 hover:border-white transition-all"
        >
          {creating ? 'Cancel' : '+ New Brief'}
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="mb-8 p-6 border border-white/20 space-y-4">
          <h3 className="text-sm font-medium mb-2">New Brief</h3>
          <div>
            <label className="text-xs font-mono text-white/40 block mb-1">Title *</label>
            <input
              type="text" required maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-mono text-white/40 block mb-1">Description *</label>
            <textarea
              required rows={4} maxLength={2000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-mono text-white/40 block mb-1">Ends (optional)</label>
            <input
              type="date"
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              className="bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
            />
          </div>
          {msg && <p className="text-xs font-mono text-green-400">{msg}</p>}
          <button
            type="submit"
            className="px-6 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 transition-all"
          >
            Create &amp; Set as Current →
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-white/20 text-xs font-mono">Loading…</p>
      ) : (
        <div className="space-y-4">
          {briefs.map((b) => (
            <div key={b.id} className="p-5 border border-white/10 hover:border-white/20 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-sm font-medium">{b.title}</h3>
                {b.is_current && (
                  <span className="text-xs font-mono bg-white text-black px-2 py-0.5">
                    CURRENT
                  </span>
                )}
              </div>
              <p className="text-xs text-white/40 leading-relaxed mb-2">{b.description}</p>
              <div className="flex gap-4 text-xs text-white/20 font-mono">
                <span>{new Date(b.created_at).toLocaleDateString()}</span>
                {b.ends_at && <span>Ends: {b.ends_at}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Submissions Tab ────────────────────────────────────────────────────
function SubmissionsTab() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [acting,      setActing]      = useState<string | null>(null);
  const [approveForm, setApproveForm] = useState<{ id: string; edition_size: string; price_usdc: string } | null>(null);
  const [rejectForm,  setRejectForm]  = useState<{ id: string; reason: string } | null>(null);
  const [msg,         setMsg]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/rrg/submissions');
    const data = await res.json();
    setSubmissions(data.submissions || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveForm) return;
    setActing(approveForm.id);
    setMsg('');
    const res = await fetch('/api/rrg/approve', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        submissionId: approveForm.id,
        edition_size: approveForm.edition_size,
        price_usdc:   approveForm.price_usdc,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`Approved ✓ Token #${data.tokenId} — tx: ${data.txHash?.slice(0, 10)}…`);
      setApproveForm(null);
      load();
    } else {
      setMsg(`Error: ${data.error}`);
    }
    setActing(null);
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectForm) return;
    setActing(rejectForm.id);
    setMsg('');
    const res = await fetch('/api/rrg/reject', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        submissionId: rejectForm.id,
        reason:       rejectForm.reason,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg('Rejected ✓');
      setRejectForm(null);
      load();
    } else {
      setMsg(`Error: ${data.error}`);
    }
    setActing(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">
          Pending Submissions
        </h2>
        <button
          onClick={load}
          className="text-xs text-white/30 hover:text-white transition-colors font-mono"
        >
          ↻ Refresh
        </button>
      </div>

      {msg && (
        <div className="mb-4 p-3 border border-white/20 bg-white/5 text-xs font-mono text-white/80">
          {msg}
        </div>
      )}

      {loading ? (
        <p className="text-white/20 text-xs font-mono">Loading…</p>
      ) : submissions.length === 0 ? (
        <p className="text-white/20 text-xs font-mono">No pending submissions.</p>
      ) : (
        <div className="space-y-6">
          {submissions.map((s) => (
            <div key={s.id} className="border border-white/10 overflow-hidden">
              {/* Header */}
              <div className="flex gap-4 p-5">
                {/* Preview image */}
                {s.previewUrl && (
                  <div className="w-24 h-24 flex-shrink-0 bg-white/5 overflow-hidden">
                    <img
                      src={s.previewUrl}
                      alt={s.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="text-sm font-medium truncate pr-2">{s.title}</h3>
                    <span className="text-xs font-mono text-white/30 flex-shrink-0">
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-xs text-white/40 leading-relaxed mb-2 line-clamp-2">
                      {s.description}
                    </p>
                  )}
                  <div className="flex gap-4 text-xs text-white/20 font-mono flex-wrap">
                    <span title={s.creator_wallet}>
                      Wallet: {s.creator_wallet.slice(0, 6)}…{s.creator_wallet.slice(-4)}
                    </span>
                    {s.creator_email && <span>{s.creator_email}</span>}
                  </div>
                </div>
              </div>

              {/* Actions */}
              {approveForm?.id === s.id ? (
                <form onSubmit={handleApprove} className="border-t border-white/10 p-4 flex gap-3 items-end">
                  <div>
                    <label className="text-xs font-mono text-white/40 block mb-1">Edition size (1–50)</label>
                    <input
                      type="number" required min={1} max={50}
                      value={approveForm.edition_size}
                      onChange={(e) => setApproveForm({ ...approveForm, edition_size: e.target.value })}
                      className="w-24 bg-transparent border border-white/20 px-3 py-1.5 text-sm focus:border-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-white/40 block mb-1">Price USDC</label>
                    <input
                      type="number" required min={0.5} max={50} step={0.5}
                      value={approveForm.price_usdc}
                      onChange={(e) => setApproveForm({ ...approveForm, price_usdc: e.target.value })}
                      className="w-24 bg-transparent border border-white/20 px-3 py-1.5 text-sm focus:border-white outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={acting === s.id}
                    className="px-5 py-1.5 bg-white text-black text-sm font-medium
                               hover:bg-white/90 disabled:opacity-40 transition-all"
                  >
                    {acting === s.id ? 'Approving…' : 'Confirm Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setApproveForm(null)}
                    className="text-xs text-white/30 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </form>
              ) : rejectForm?.id === s.id ? (
                <form onSubmit={handleReject} className="border-t border-white/10 p-4 flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-xs font-mono text-white/40 block mb-1">Reason (optional)</label>
                    <input
                      type="text" maxLength={500}
                      placeholder="Reason for rejection…"
                      value={rejectForm.reason}
                      onChange={(e) => setRejectForm({ ...rejectForm, reason: e.target.value })}
                      className="w-full bg-transparent border border-white/20 px-3 py-1.5 text-sm focus:border-white outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={acting === s.id}
                    className="px-5 py-1.5 border border-red-400/50 text-red-400 text-sm
                               hover:border-red-400 disabled:opacity-40 transition-all"
                  >
                    {acting === s.id ? 'Rejecting…' : 'Confirm Reject'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectForm(null)}
                    className="text-xs text-white/30 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="border-t border-white/10 p-4 flex gap-3">
                  <button
                    onClick={() => {
                      setApproveForm({ id: s.id, edition_size: '10', price_usdc: '5' });
                      setRejectForm(null);
                    }}
                    className="px-5 py-1.5 bg-white text-black text-xs font-medium hover:bg-white/90 transition-all"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setRejectForm({ id: s.id, reason: '' });
                      setApproveForm(null);
                    }}
                    className="px-5 py-1.5 border border-red-400/30 text-red-400 text-xs
                               hover:border-red-400 transition-all"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Drops Tab ──────────────────────────────────────────────────────────
function DropsTab() {
  const [drops,   setDrops]   = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/rrg/drops')
      .then((r) => r.json())
      .then((d) => { setDrops(d.drops || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const isTestnet = process.env.NEXT_PUBLIC_CHAIN_ID === '84532';
  const scanBase  = isTestnet ? 'https://sepolia.basescan.org' : 'https://basescan.org';

  return (
    <div>
      <h2 className="text-xs font-mono uppercase tracking-widest text-white/40 mb-6">
        Approved Drops
      </h2>
      {loading ? (
        <p className="text-white/20 text-xs font-mono">Loading…</p>
      ) : drops.length === 0 ? (
        <p className="text-white/20 text-xs font-mono">No approved drops yet.</p>
      ) : (
        <div className="space-y-3">
          {drops.map((d) => (
            <div key={d.id} className="p-4 border border-white/10 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium">{d.title}</p>
                <div className="flex gap-4 mt-1 text-xs text-white/30 font-mono">
                  <span>Token #{d.token_id}</span>
                  <span>${parseFloat(d.price_usdc).toFixed(2)} USDC</span>
                  <span>{d.edition_size} ed.</span>
                  <span>{new Date(d.approved_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <a
                  href={`/rrg/drop/${d.token_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-white transition-colors"
                >
                  View ↗
                </a>
                <a
                  href={`${scanBase}/address/${process.env.NEXT_PUBLIC_RRG_CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-white transition-colors font-mono"
                >
                  Contract ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
