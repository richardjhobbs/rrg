'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────
interface Brief {
  id: string;
  title: string;
  description: string;
  ends_at?: string | null;
  status: string;
  is_current: boolean;
  created_at: string;
  social_caption?: string | null;
  brand_id?: string | null;
  brand?: { name: string; slug: string } | null;
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
  // Parsed from description tag:
  suggestedEdition?: string;
  suggestedPrice?: string;
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

interface Brand {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  headline?: string | null;
  contact_email: string;
  wallet_address: string;
  website_url?: string | null;
  status: string;
  max_self_listings: number;
  self_listings_used: number;
  created_at: string;
}

interface Distribution {
  id: string;
  created_at: string;
  purchase_id: string;
  brand_id?: string | null;
  total_usdc: string;
  creator_usdc: string;
  brand_usdc: string;
  platform_usdc: string;
  creator_wallet?: string | null;
  brand_wallet?: string | null;
  split_type: string;
  status: string;
  notes?: string | null;
}

interface Contributor {
  wallet_address: string;
  creator_type: string;
  display_name?: string | null;
  email?: string | null;
  registered_at: string;
  last_active_at?: string | null;
  total_submissions: number;
  total_approved: number;
  total_rejected: number;
  total_revenue_usdc: number;
  brands_contributed: string[];
}

type Tab = 'briefs' | 'submissions' | 'drops' | 'brands' | 'distributions' | 'contributors';

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
        {(['submissions', 'briefs', 'drops', 'brands', 'distributions', 'contributors'] as Tab[]).map((t) => (
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
        {tab === 'briefs'        && <BriefTab />}
        {tab === 'submissions'   && <SubmissionsTab />}
        {tab === 'drops'         && <DropsTab />}
        {tab === 'brands'        && <BrandsTab />}
        {tab === 'distributions' && <DistributionsTab />}
        {tab === 'contributors' && <ContributorsTab />}
      </div>
    </div>
  );
}

// ── Brief Tab ──────────────────────────────────────────────────────────
function BriefTab() {
  const [briefs,   setBriefs]   = useState<Brief[]>([]);
  const [brands,   setBrands]   = useState<Brand[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing,  setEditing]  = useState<string | null>(null);
  const [acting,   setActing]   = useState(false);
  const [form,     setForm]     = useState({ title: '', description: '', starts_at: new Date().toISOString().split('T')[0], ends_at: '', brand_id: '00000000-0000-4000-8000-000000000001' });
  const [editForm, setEditForm] = useState({ title: '', description: '', ends_at: '' });
  const [msg,      setMsg]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [briefsRes, brandsRes] = await Promise.all([
      fetch('/api/rrg/briefs?admin=1'),
      fetch('/api/rrg/admin/brands'),
    ]);
    const briefsData = await briefsRes.json();
    const brandsData = await brandsRes.json();
    setBriefs(briefsData.briefs || []);
    setBrands((brandsData.brands || []).filter((b: Brand) => b.status === 'active'));
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
      setForm({ title: '', description: '', starts_at: new Date().toISOString().split('T')[0], ends_at: '', brand_id: '00000000-0000-4000-8000-000000000001' });
      setCreating(false);
      load();
    } else {
      setMsg(data.error || 'Failed');
    }
  };

  const handleUpdate = async (briefId: string) => {
    setActing(true);
    setMsg('');
    const res = await fetch(`/api/rrg/brief/${briefId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();
    setActing(false);
    if (res.ok) {
      setMsg('Brief updated ✓');
      setEditing(null);
      load();
    } else {
      setMsg(`Error: ${data.error}`);
    }
  };

  const handleAction = async (briefId: string, action: Record<string, unknown>) => {
    setActing(true);
    setMsg('');
    const res = await fetch(`/api/rrg/brief/${briefId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    setActing(false);
    if (res.ok) {
      setMsg('Updated ✓');
      load();
    } else {
      const data = await res.json();
      setMsg(`Error: ${data.error}`);
    }
  };

  const handleDelete = async (briefId: string, title: string) => {
    if (!confirm(`Delete brief "${title}"? This cannot be undone.`)) return;
    setActing(true);
    setMsg('');
    const res = await fetch(`/api/rrg/brief/${briefId}`, { method: 'DELETE' });
    setActing(false);
    if (res.ok) {
      setMsg('Brief deleted ✓');
      load();
    } else {
      const data = await res.json();
      setMsg(`Error: ${data.error}`);
    }
  };

  const startEdit = (b: Brief) => {
    setEditing(b.id);
    setEditForm({
      title: b.title,
      description: b.description,
      ends_at: b.ends_at?.split('T')[0] || '',
    });
  };

  const statusColor = (s: string) => {
    if (s === 'active')   return 'bg-green-400/20 text-green-400';
    if (s === 'closed')   return 'bg-amber-400/20 text-amber-400';
    return 'bg-white/10 text-white/40';
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">
          Briefs ({briefs.length})
        </h2>
        <button
          onClick={() => { setCreating(!creating); setEditing(null); }}
          className="text-xs border border-white/30 px-4 py-1.5 hover:border-white transition-all"
        >
          {creating ? 'Cancel' : '+ New Brief'}
        </button>
      </div>

      {msg && (
        <div className={`mb-4 p-3 border text-xs font-mono ${
          msg.startsWith('Error') ? 'border-red-400/30 text-red-400' : 'border-white/20 text-green-400'
        }`}>
          {msg}
        </div>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="mb-8 p-6 border border-white/20 space-y-4">
          <h3 className="text-sm font-medium mb-2">New Brief</h3>
          <div>
            <label className="text-xs font-mono text-white/40 block mb-1">Brand *</label>
            <select
              value={form.brand_id}
              onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
              className="w-full bg-black border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
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
          <button
            type="submit"
            className="px-6 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 transition-all"
          >
            Create &amp; Set as Current &rarr;
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-white/20 text-xs font-mono">Loading…</p>
      ) : (
        <div className="space-y-4">
          {briefs.map((b) => (
            <div key={b.id} className="border border-white/10 overflow-hidden">
              {editing === b.id ? (
                /* ── Edit form ────────────────────────────────── */
                <div className="p-5 space-y-3">
                  <div>
                    <label className="text-xs font-mono text-white/40 block mb-1">Title</label>
                    <input
                      type="text" maxLength={200}
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-white/40 block mb-1">Description</label>
                    <textarea
                      rows={4} maxLength={2000}
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-white/40 block mb-1">Ends</label>
                    <input
                      type="date"
                      value={editForm.ends_at}
                      onChange={(e) => setEditForm({ ...editForm, ends_at: e.target.value })}
                      className="bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleUpdate(b.id)}
                      disabled={acting}
                      className="px-5 py-1.5 bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-40 transition-all"
                    >
                      {acting ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="text-xs text-white/30 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Brief display ────────────────────────────── */
                <div className="p-5">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium truncate">{b.title}</h3>
                        {b.is_current && (
                          <span className="shrink-0 text-[10px] font-mono bg-white text-black px-2 py-0.5 uppercase">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed mb-2 line-clamp-2">{b.description}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-mono px-2 py-0.5 uppercase ${statusColor(b.status || 'active')}`}>
                      {b.status || 'active'}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-white/20 font-mono">
                    {b.brand && (
                      <span className="text-white/40">Brand: {b.brand.name}</span>
                    )}
                    <span>{new Date(b.created_at).toLocaleDateString()}</span>
                    {b.ends_at && <span>Ends: {new Date(b.ends_at).toLocaleDateString()}</span>}
                  </div>
                </div>
              )}

              {/* Actions bar */}
              {editing !== b.id && (
                <div className="border-t border-white/10 p-4 flex gap-3 flex-wrap">
                  <button
                    onClick={() => startEdit(b)}
                    className="px-4 py-1.5 text-xs border border-white/20 hover:border-white/50 transition-all"
                  >
                    Edit
                  </button>
                  {!b.is_current && b.status === 'active' && (
                    <button
                      onClick={() => handleAction(b.id, { is_current: true })}
                      disabled={acting}
                      className="px-4 py-1.5 text-xs border border-white/20 text-white/60 hover:border-white/50 disabled:opacity-40 transition-all"
                    >
                      Set Current
                    </button>
                  )}
                  {b.status === 'active' && (
                    <button
                      onClick={() => handleAction(b.id, { status: 'closed', is_current: false })}
                      disabled={acting}
                      className="px-4 py-1.5 text-xs border border-amber-400/30 text-amber-400 hover:border-amber-400 disabled:opacity-40 transition-all"
                    >
                      Close
                    </button>
                  )}
                  {b.status === 'closed' && (
                    <button
                      onClick={() => handleAction(b.id, { status: 'active' })}
                      disabled={acting}
                      className="px-4 py-1.5 text-xs border border-green-400/30 text-green-400 hover:border-green-400 disabled:opacity-40 transition-all"
                    >
                      Reactivate
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(b.id, b.title)}
                    disabled={acting}
                    className="px-4 py-1.5 text-xs border border-red-400/30 text-red-400 hover:border-red-400 disabled:opacity-40 transition-all"
                  >
                    Delete
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

// ── Submissions Tab ────────────────────────────────────────────────────
function SubmissionsTab() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [acting,      setActing]      = useState<string | null>(null);
  const [approveForm, setApproveForm] = useState<{ id: string; edition_size: string; price_usdc: string } | null>(null);
  const [rejectForm,  setRejectForm]  = useState<{ id: string; reason: string } | null>(null);
  const [msg,         setMsg]         = useState('');
  const [lightbox,    setLightbox]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/rrg/submissions');
    const data = await res.json();
    // Parse submitter suggestions out of description tag
    const parsed = (data.submissions || []).map((s: Submission) => {
      const match = (s.description || '').match(/\[Suggested: (\S+) ed · \$([0-9.]+) USDC\]/);
      return {
        ...s,
        suggestedEdition: match?.[1] ?? '',
        suggestedPrice:   match?.[2] ?? '',
        description:      s.description?.replace(/\n?\[Suggested:[^\]]+\]/, '').trim() || null,
      };
    });
    setSubmissions(parsed);
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
                  <button
                    type="button"
                    onClick={() => setLightbox(s.previewUrl!)}
                    className="w-24 h-24 flex-shrink-0 bg-white/5 overflow-hidden cursor-zoom-in"
                  >
                    <img
                      src={s.previewUrl}
                      alt={s.title}
                      className="w-full h-full object-cover"
                    />
                  </button>
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
                  {(s.suggestedEdition || s.suggestedPrice) && (
                    <div className="mt-2 text-xs font-mono text-amber-400/60">
                      Suggested: {s.suggestedEdition ? `${s.suggestedEdition} ed` : ''}
                      {s.suggestedEdition && s.suggestedPrice ? ' · ' : ''}
                      {s.suggestedPrice ? `$${s.suggestedPrice} USDC` : ''}
                    </div>
                  )}
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
                      setApproveForm({
                        id:           s.id,
                        edition_size: s.suggestedEdition || '10',
                        price_usdc:   s.suggestedPrice   || '5',
                      });
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

      {/* Lightbox overlay */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-zoom-out"
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setLightbox(null); }}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          <img
            src={lightbox}
            alt="Full-size preview"
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ── Drops Tab ──────────────────────────────────────────────────────────
function DropsTab() {
  const [drops,   setDrops]   = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', price_usdc: '', edition_size: '', description: '' });
  const [acting,  setActing]  = useState(false);
  const [msg,     setMsg]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/rrg/drops');
    const d = await res.json();
    setDrops(d.drops || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (d: Drop) => {
    setEditing(d.id);
    setEditForm({
      title: d.title,
      price_usdc: parseFloat(d.price_usdc).toString(),
      edition_size: d.edition_size.toString(),
      description: '',
    });
    setMsg('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setActing(true);
    setMsg('');
    const res = await fetch('/api/rrg/admin/drops', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submissionId: editing,
        title: editForm.title,
        price_usdc: editForm.price_usdc,
        edition_size: editForm.edition_size,
      }),
    });
    const data = await res.json();
    setActing(false);
    if (res.ok) {
      setMsg(`Updated ✓ (${data.updated?.join(', ')})`);
      setEditing(null);
      load();
    } else {
      setMsg(`Error: ${data.error}`);
    }
  };

  const scanBase = 'https://basescan.org';

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">
          Approved Drops
        </h2>
        <button onClick={load} className="text-xs text-white/30 hover:text-white transition-colors font-mono">
          ↻ Refresh
        </button>
      </div>

      {msg && (
        <div className={`mb-4 p-3 border text-xs font-mono ${
          msg.startsWith('Error') ? 'border-red-400/30 text-red-400' : 'border-white/20 text-green-400'
        }`}>{msg}</div>
      )}

      {loading ? (
        <p className="text-white/20 text-xs font-mono">Loading…</p>
      ) : drops.length === 0 ? (
        <p className="text-white/20 text-xs font-mono">No approved drops yet.</p>
      ) : (
        <div className="space-y-3">
          {drops.map((d) => (
            <div key={d.id} className="border border-white/10">
              <div className="p-4 flex justify-between items-center">
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
                  <button
                    onClick={() => editing === d.id ? setEditing(null) : startEdit(d)}
                    className="text-white/30 hover:text-white transition-colors"
                  >
                    {editing === d.id ? 'Cancel' : 'Edit'}
                  </button>
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

              {editing === d.id && (
                <form onSubmit={handleSave} className="border-t border-white/10 p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-mono text-white/40 block mb-1">Title</label>
                      <input
                        type="text" required maxLength={60}
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="w-full bg-transparent border border-white/20 px-3 py-1.5 text-sm focus:border-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-white/40 block mb-1">Price USDC</label>
                      <input
                        type="number" required min={0.5} max={50} step={0.5}
                        value={editForm.price_usdc}
                        onChange={(e) => setEditForm({ ...editForm, price_usdc: e.target.value })}
                        className="w-full bg-transparent border border-white/20 px-3 py-1.5 text-sm focus:border-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-white/40 block mb-1">Edition Size</label>
                      <input
                        type="number" required min={1} max={50}
                        value={editForm.edition_size}
                        onChange={(e) => setEditForm({ ...editForm, edition_size: e.target.value })}
                        className="w-full bg-transparent border border-white/20 px-3 py-1.5 text-sm focus:border-white outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={acting}
                    className="px-5 py-1.5 bg-white text-black text-sm font-medium
                               hover:bg-white/90 disabled:opacity-40 transition-all"
                  >
                    {acting ? 'Saving…' : 'Save Changes'}
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Brands Tab ────────────────────────────────────────────────────────
function BrandsTab() {
  const [brands,    setBrands]    = useState<Brand[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [inviting,  setInviting]  = useState<string | null>(null); // brandId being invited
  const [msg,       setMsg]       = useState('');
  const [form,      setForm]      = useState({
    name: '', slug: '', contact_email: '', wallet_address: '', description: '', headline: '', website_url: '',
  });
  const [inviteForm, setInviteForm] = useState({ email: '', temp_password: '' });
  const [editing,    setEditing]   = useState<string | null>(null);
  const [editForm,   setEditForm]  = useState({ name: '', headline: '', description: '', website_url: '', contact_email: '', wallet_address: '' });
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/rrg/admin/brands');
    const data = await res.json();
    setBrands(data.brands || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/rrg/admin/brands/create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`Brand "${data.brand.name}" created ✓`);
      setForm({ name: '', slug: '', contact_email: '', wallet_address: '', description: '', headline: '', website_url: '' });
      setCreating(false);
      load();
    } else {
      setMsg(`Error: ${data.error}`);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviting) return;
    setMsg('');
    const res = await fetch('/api/rrg/admin/brands/invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ brand_id: inviting, email: inviteForm.email, temp_password: inviteForm.temp_password }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`Invited ${inviteForm.email} ✓`);
      setInviteForm({ email: '', temp_password: '' });
      setInviting(null);
    } else {
      setMsg(`Error: ${data.error}`);
    }
  };

  const handleStatusToggle = async (brand: Brand) => {
    const newStatus = brand.status === 'active' ? 'suspended' : 'active';
    setMsg('');
    const res = await fetch(`/api/rrg/admin/brands/${brand.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setMsg(`Brand ${newStatus === 'active' ? 'activated' : 'suspended'} ✓`);
      load();
    } else {
      const data = await res.json();
      setMsg(`Error: ${data.error}`);
    }
  };

  const startEdit = (b: Brand) => {
    setEditing(b.id);
    setInviting(null);
    setEditForm({
      name: b.name || '',
      headline: b.headline || '',
      description: b.description || '',
      website_url: b.website_url || '',
      contact_email: b.contact_email || '',
      wallet_address: b.wallet_address || '',
    });
  };

  const handleEditSave = async (brandId: string) => {
    setEditSaving(true);
    setMsg('');
    const res = await fetch(`/api/rrg/admin/brands/${brandId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();
    setEditSaving(false);
    if (res.ok) {
      setMsg('Brand updated ✓');
      setEditing(null);
      load();
    } else {
      setMsg(`Error: ${data.error}`);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">Brands</h2>
        <button
          onClick={() => setCreating(!creating)}
          className="text-xs border border-white/30 px-4 py-1.5 hover:border-white transition-all"
        >
          {creating ? 'Cancel' : '+ Register Brand'}
        </button>
      </div>

      {msg && (
        <div className="mb-4 p-3 border border-white/20 bg-white/5 text-xs font-mono text-white/80">
          {msg}
        </div>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="mb-8 p-6 border border-white/20 space-y-4">
          <h3 className="text-sm font-medium mb-2">Register New Brand</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Name *</label>
              <input
                type="text" required maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Slug *</label>
              <input
                type="text" required maxLength={50}
                placeholder="my-brand"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Contact Email *</label>
              <input
                type="email" required
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Wallet Address *</label>
              <input
                type="text" required
                placeholder="0x…"
                value={form.wallet_address}
                onChange={(e) => setForm({ ...form, wallet_address: e.target.value })}
                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Headline</label>
              <input
                type="text" maxLength={200}
                value={form.headline}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Website</label>
              <input
                type="url"
                value={form.website_url}
                onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-mono text-white/40 block mb-1">Description</label>
            <textarea
              rows={3} maxLength={1000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none resize-none"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 transition-all"
          >
            Create Brand →
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-white/20 text-xs font-mono">Loading…</p>
      ) : brands.length === 0 ? (
        <p className="text-white/20 text-xs font-mono">No brands registered.</p>
      ) : (
        <div className="space-y-4">
          {brands.map((b) => (
            <div key={b.id} className="border border-white/10 overflow-hidden">
              {editing === b.id ? (
                /* ── Edit form ────────────────────────────── */
                <div className="p-5 space-y-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-mono text-white/40">Editing: /{b.slug}</span>
                    <span className={`text-xs font-mono px-2 py-0.5 ${
                      b.status === 'active' ? 'bg-green-400/20 text-green-400' :
                      b.status === 'suspended' ? 'bg-red-400/20 text-red-400' :
                      'bg-white/10 text-white/40'
                    }`}>{b.status.toUpperCase()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-mono text-white/40 block mb-1">Name</label>
                      <input
                        type="text" maxLength={100}
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-white/40 block mb-1">Headline</label>
                      <input
                        type="text" maxLength={200}
                        value={editForm.headline}
                        onChange={(e) => setEditForm({ ...editForm, headline: e.target.value })}
                        className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-white/40 block mb-1">Contact Email</label>
                      <input
                        type="email"
                        value={editForm.contact_email}
                        onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })}
                        className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-white/40 block mb-1">Website</label>
                      <input
                        type="url"
                        value={editForm.website_url}
                        onChange={(e) => setEditForm({ ...editForm, website_url: e.target.value })}
                        className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-mono text-white/40 block mb-1">Wallet Address</label>
                    <input
                      type="text"
                      value={editForm.wallet_address}
                      onChange={(e) => setEditForm({ ...editForm, wallet_address: e.target.value })}
                      className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-white/40 block mb-1">Description</label>
                    <textarea
                      rows={3} maxLength={1000}
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none resize-none"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleEditSave(b.id)}
                      disabled={editSaving}
                      className="px-5 py-1.5 bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-40 transition-all"
                    >
                      {editSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="text-xs text-white/30 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Brand display ────────────────────────── */
                <>
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-sm font-medium">{b.name}</h3>
                        <span className="text-xs font-mono text-white/30">/{b.slug}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono px-2 py-0.5 ${
                          b.status === 'active'    ? 'bg-green-400/20 text-green-400' :
                          b.status === 'pending'   ? 'bg-amber-400/20 text-amber-400' :
                          b.status === 'suspended' ? 'bg-red-400/20 text-red-400' :
                                                     'bg-white/10 text-white/40'
                        }`}>
                          {b.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    {b.headline && <p className="text-xs text-white/50 mb-2">{b.headline}</p>}
                    <div className="flex gap-4 text-xs text-white/20 font-mono flex-wrap">
                      <span title={b.wallet_address}>
                        {b.wallet_address.slice(0, 6)}…{b.wallet_address.slice(-4)}
                      </span>
                      <span>{b.contact_email}</span>
                      <span>Listings: {b.self_listings_used}/{b.max_self_listings}</span>
                      <span>{new Date(b.created_at).toLocaleDateString()}</span>
                      {b.website_url && <a href={b.website_url} target="_blank" rel="noopener noreferrer" className="hover:text-white/50">{b.website_url}</a>}
                    </div>
                  </div>

                  {/* Invite form */}
                  {inviting === b.id ? (
                    <form onSubmit={handleInvite} className="border-t border-white/10 p-4 flex gap-3 items-end flex-wrap">
                      <div>
                        <label className="text-xs font-mono text-white/40 block mb-1">Admin email</label>
                        <input
                          type="email" required
                          value={inviteForm.email}
                          onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                          className="w-56 bg-transparent border border-white/20 px-3 py-1.5 text-sm focus:border-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-mono text-white/40 block mb-1">Temp password</label>
                        <input
                          type="text" required minLength={8}
                          value={inviteForm.temp_password}
                          onChange={(e) => setInviteForm({ ...inviteForm, temp_password: e.target.value })}
                          className="w-40 bg-transparent border border-white/20 px-3 py-1.5 text-sm focus:border-white outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-5 py-1.5 bg-white text-black text-sm font-medium hover:bg-white/90 transition-all"
                      >
                        Send Invite
                      </button>
                      <button
                        type="button"
                        onClick={() => setInviting(null)}
                        className="text-xs text-white/30 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="border-t border-white/10 p-4 flex gap-3">
                      <button
                        onClick={() => startEdit(b)}
                        className="px-4 py-1.5 text-xs border border-white/20 hover:border-white/50 transition-all"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { setInviting(b.id); setEditing(null); setInviteForm({ email: '', temp_password: '' }); }}
                        className="px-4 py-1.5 text-xs border border-white/20 hover:border-white/50 transition-all"
                      >
                        Invite Admin
                      </button>
                      <button
                        onClick={() => handleStatusToggle(b)}
                        className={`px-4 py-1.5 text-xs border transition-all ${
                          b.status === 'active'
                            ? 'border-red-400/30 text-red-400 hover:border-red-400'
                            : 'border-green-400/30 text-green-400 hover:border-green-400'
                        }`}
                      >
                        {b.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Distributions Tab ─────────────────────────────────────────────────
function DistributionsTab() {
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [statusFilter,  setStatusFilter]  = useState<string>('');
  const [acting,        setActing]        = useState<string | null>(null);
  const [msg,           setMsg]           = useState('');
  const [payoutConfirm, setPayoutConfirm] = useState(false);
  const [payoutRunning, setPayoutRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = statusFilter ? `?status=${statusFilter}` : '';
    const res  = await fetch(`/api/rrg/admin/distributions${qs}`);
    const data = await res.json();
    setDistributions(data.distributions || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleMarkCompleted = async (id: string) => {
    setActing(id);
    setMsg('');
    const res = await fetch(`/api/rrg/admin/distributions/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'completed', notes: `Marked completed by admin on ${new Date().toISOString().split('T')[0]}` }),
    });
    if (res.ok) {
      setMsg('Distribution marked completed ✓');
      load();
    } else {
      const data = await res.json();
      setMsg(`Error: ${data.error}`);
    }
    setActing(null);
  };

  const handleProcessPayouts = async () => {
    setPayoutRunning(true);
    setMsg('');
    try {
      const res = await fetch('/api/rrg/admin/distributions/payout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`Payout complete: ${data.succeeded} succeeded, ${data.failed} failed. $${data.totalDistributed?.toFixed(2) ?? '0.00'} distributed.`);
        load();
      } else {
        setMsg(`Payout error: ${data.error}`);
      }
    } catch (err) {
      setMsg(`Payout error: ${String(err)}`);
    }
    setPayoutRunning(false);
    setPayoutConfirm(false);
  };

  // Pending count for payout button
  const pendingCount = distributions.filter(
    (d) => d.status === 'pending' && d.split_type !== 'legacy_70_30'
  ).length;
  const pendingOwed = distributions
    .filter((d) => d.status === 'pending' && d.split_type !== 'legacy_70_30')
    .reduce((sum, d) => sum + parseFloat(d.creator_usdc) + parseFloat(d.brand_usdc), 0);

  // Summary totals
  const totals = distributions.reduce(
    (acc, d) => ({
      total:    acc.total    + parseFloat(d.total_usdc),
      creator:  acc.creator  + parseFloat(d.creator_usdc),
      brand:    acc.brand    + parseFloat(d.brand_usdc),
      platform: acc.platform + parseFloat(d.platform_usdc),
    }),
    { total: 0, creator: 0, brand: 0, platform: 0 }
  );

  const splitLabel = (s: string) => {
    const labels: Record<string, string> = {
      'challenge_35_35_30':  'Challenge 35/35/30',
      'brand_product_70_30': 'Brand Product 70/30',
      'rrg_challenge_35_65': 'RRG Challenge 35/65',
      'legacy_70_30':        'Legacy 70/30',
    };
    return labels[s] || s;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">Distributions</h2>
        <div className="flex gap-2">
          {['', 'pending', 'completed', 'failed'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs font-mono px-3 py-1 border transition-all ${
                statusFilter === s
                  ? 'border-white text-white'
                  : 'border-white/20 text-white/30 hover:border-white/50'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="mb-4 p-3 border border-white/20 bg-white/5 text-xs font-mono text-white/80">
          {msg}
        </div>
      )}

      {/* Payout action */}
      {pendingCount > 0 && (statusFilter === '' || statusFilter === 'pending') && (
        <div className="mb-4 p-4 border border-amber-400/30 bg-amber-400/5">
          {payoutConfirm ? (
            <div className="flex items-center gap-4">
              <p className="text-xs font-mono text-amber-400 flex-1">
                Process {pendingCount} pending distribution{pendingCount !== 1 ? 's' : ''}?
                Total: ${pendingOwed.toFixed(2)} USDC to creators/brands.
              </p>
              <button
                onClick={handleProcessPayouts}
                disabled={payoutRunning}
                className="px-5 py-1.5 bg-amber-400 text-black text-xs font-medium
                           hover:bg-amber-300 disabled:opacity-40 transition-all"
              >
                {payoutRunning ? 'Processing…' : 'Confirm Payout'}
              </button>
              <button
                onClick={() => setPayoutConfirm(false)}
                disabled={payoutRunning}
                className="text-xs text-white/30 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono text-white/40">
                {pendingCount} pending payout{pendingCount !== 1 ? 's' : ''} — ${pendingOwed.toFixed(2)} USDC owed
              </p>
              <button
                onClick={() => setPayoutConfirm(true)}
                className="px-4 py-1.5 text-xs border border-amber-400/40 text-amber-400
                           hover:border-amber-400 transition-all"
              >
                Process Payouts
              </button>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {distributions.length > 0 && (
        <div className="mb-6 p-4 border border-white/10 grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs font-mono text-white/30 mb-1">Total</p>
            <p className="text-sm font-medium">${totals.total.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs font-mono text-white/30 mb-1">Creators</p>
            <p className="text-sm font-medium text-green-400">${totals.creator.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs font-mono text-white/30 mb-1">Brands</p>
            <p className="text-sm font-medium text-blue-400">${totals.brand.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs font-mono text-white/30 mb-1">Platform</p>
            <p className="text-sm font-medium text-amber-400">${totals.platform.toFixed(2)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-white/20 text-xs font-mono">Loading…</p>
      ) : distributions.length === 0 ? (
        <p className="text-white/20 text-xs font-mono">No distributions found.</p>
      ) : (
        <div className="space-y-3">
          {distributions.map((d) => (
            <div key={d.id} className="p-4 border border-white/10">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-xs font-mono text-white/50">{splitLabel(d.split_type)}</span>
                  <span className="text-xs font-mono text-white/20 ml-3">
                    {new Date(d.created_at).toLocaleString()}
                  </span>
                </div>
                <span className={`text-xs font-mono px-2 py-0.5 ${
                  d.status === 'completed' ? 'bg-green-400/20 text-green-400' :
                  d.status === 'pending'   ? 'bg-amber-400/20 text-amber-400' :
                                             'bg-red-400/20 text-red-400'
                }`}>
                  {d.status.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs font-mono mb-2">
                <span className="text-white/40">Total: <span className="text-white">${parseFloat(d.total_usdc).toFixed(2)}</span></span>
                <span className="text-white/40">Creator: <span className="text-green-400">${parseFloat(d.creator_usdc).toFixed(2)}</span></span>
                <span className="text-white/40">Brand: <span className="text-blue-400">${parseFloat(d.brand_usdc).toFixed(2)}</span></span>
                <span className="text-white/40">Platform: <span className="text-amber-400">${parseFloat(d.platform_usdc).toFixed(2)}</span></span>
              </div>

              <div className="flex gap-4 text-xs text-white/20 font-mono">
                {d.creator_wallet && (
                  <span>Creator: {d.creator_wallet.slice(0, 6)}…{d.creator_wallet.slice(-4)}</span>
                )}
                {d.brand_wallet && (
                  <span>Brand: {d.brand_wallet.slice(0, 6)}…{d.brand_wallet.slice(-4)}</span>
                )}
              </div>

              {d.notes && (
                <p className="text-xs text-white/30 mt-1">{d.notes}</p>
              )}

              {d.status === 'pending' && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <button
                    onClick={() => handleMarkCompleted(d.id)}
                    disabled={acting === d.id}
                    className="px-4 py-1.5 text-xs bg-green-400/20 text-green-400 border border-green-400/30
                               hover:border-green-400 disabled:opacity-40 transition-all"
                  >
                    {acting === d.id ? 'Marking…' : 'Mark Completed'}
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

// ── Contributors Tab ────────────────────────────────────────────────────
function ContributorsTab() {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [stats, setStats] = useState<{ total: number; humans: number; agents: number; totalRevenue: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'human' | 'agent'>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/rrg/admin/contributors');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setContributors(data.contributors ?? []);
        setStats(data.stats ?? null);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = filter === 'all'
    ? contributors
    : contributors.filter((c) => c.creator_type === filter);

  if (loading) {
    return <p className="text-white/30 font-mono text-sm py-8">Loading contributors…</p>;
  }

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-white/10 p-4">
            <p className="text-xs text-white/40 font-mono uppercase tracking-wider">Total</p>
            <p className="text-2xl font-mono mt-1">{stats.total}</p>
          </div>
          <div className="border border-white/10 p-4">
            <p className="text-xs text-white/40 font-mono uppercase tracking-wider">Human</p>
            <p className="text-2xl font-mono mt-1">{stats.humans}</p>
          </div>
          <div className="border border-white/10 p-4">
            <p className="text-xs text-white/40 font-mono uppercase tracking-wider">AI Agent</p>
            <p className="text-2xl font-mono mt-1">{stats.agents}</p>
          </div>
          <div className="border border-white/10 p-4">
            <p className="text-xs text-white/40 font-mono uppercase tracking-wider">Revenue Dist.</p>
            <p className="text-2xl font-mono mt-1">${stats.totalRevenue.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-3">
        {(['all', 'human', 'agent'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border transition-all
              ${filter === f
                ? 'text-white border-white'
                : 'text-white/30 border-white/10 hover:text-white/60'
              }`}
          >
            {f === 'all' ? `All (${contributors.length})` : f}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-white/30 text-sm font-mono py-4">No contributors found.</p>
      ) : (
        <div className="border border-white/10 overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-white/10 text-white/40 uppercase tracking-wider">
                <th className="text-left p-3">Wallet</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-right p-3">Subs</th>
                <th className="text-right p-3">Approved</th>
                <th className="text-right p-3">Rejected</th>
                <th className="text-right p-3">Rate</th>
                <th className="text-right p-3">Revenue</th>
                <th className="text-left p-3">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const rate = c.total_submissions > 0
                  ? ((c.total_approved / c.total_submissions) * 100).toFixed(0)
                  : '—';
                return (
                  <tr key={c.wallet_address} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-3 text-white/60">
                      {c.wallet_address.slice(0, 6)}…{c.wallet_address.slice(-4)}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider
                        ${c.creator_type === 'agent'
                          ? 'bg-purple-400/20 text-purple-300 border border-purple-400/30'
                          : 'bg-blue-400/20 text-blue-300 border border-blue-400/30'
                        }`}
                      >
                        {c.creator_type}
                      </span>
                    </td>
                    <td className="p-3 text-white/60">{c.display_name || '—'}</td>
                    <td className="p-3 text-white/40 truncate max-w-[180px]">{c.email || '—'}</td>
                    <td className="p-3 text-right">{c.total_submissions}</td>
                    <td className="p-3 text-right text-green-400">{c.total_approved}</td>
                    <td className="p-3 text-right text-red-400">{c.total_rejected}</td>
                    <td className="p-3 text-right text-white/40">{rate}%</td>
                    <td className="p-3 text-right">${Number(c.total_revenue_usdc).toFixed(2)}</td>
                    <td className="p-3 text-white/40">
                      {c.last_active_at
                        ? new Date(c.last_active_at).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
