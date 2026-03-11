'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBrandContext } from './layout';

// ── Types ──────────────────────────────────────────────────────────
interface Drop {
  id: string;
  title: string;
  token_id: number;
  price_usdc: string;
  edition_size: number;
  approved_at: string;
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
}

interface SalesStats {
  totalSales: number;
  totalRevenue: number;
  brandRevenue: number;
}

interface BrandSettings {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  headline?: string | null;
  contact_email: string;
  wallet_address: string;
  website_url?: string | null;
  social_links?: Record<string, string>;
  max_self_listings: number;
  self_listings_used: number;
}

type Tab = 'products' | 'sales' | 'settings';

export default function BrandAdminPage() {
  const ctx = useBrandContext();
  const [tab, setTab] = useState<Tab>('products');

  if (!ctx) return null;

  return (
    <>
      {/* Tabs */}
      <div className="border-b border-white/10 px-6 flex gap-6">
        {(['products', 'sales', 'settings'] as Tab[]).map((t) => (
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
        {tab === 'products' && <ProductsTab brandId={ctx.brandId} />}
        {tab === 'sales'    && <SalesTab brandId={ctx.brandId} />}
        {tab === 'settings' && <SettingsTab brandId={ctx.brandId} />}
      </div>
    </>
  );
}

// ── Products Tab ──────────────────────────────────────────────────
function ProductsTab({ brandId }: { brandId: string }) {
  const [drops,    setDrops]    = useState<Drop[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [msg,      setMsg]      = useState('');
  const [acting,   setActing]   = useState(false);
  const [brand,    setBrand]    = useState<BrandSettings | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    price_usdc: '5',
    edition_size: '10',
  });
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [dropsRes, settingsRes] = await Promise.all([
      fetch(`/api/brand/${brandId}/products`),
      fetch(`/api/brand/${brandId}/settings`),
    ]);
    const dropsData    = await dropsRes.json();
    const settingsData = await settingsRes.json();
    setDrops(dropsData.drops || []);
    setBrand(settingsData.brand || null);
    setLoading(false);
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  const canSelfList = brand
    ? brand.self_listings_used < brand.max_self_listings
    : false;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setMsg('Image required'); return; }
    setActing(true);
    setMsg('');

    const fd = new FormData();
    fd.append('title', form.title);
    fd.append('description', form.description);
    fd.append('price_usdc', form.price_usdc);
    fd.append('edition_size', form.edition_size);
    fd.append('jpeg', file);

    const res  = await fetch(`/api/brand/${brandId}/products/create`, { method: 'POST', body: fd });
    const data = await res.json();
    setActing(false);

    if (res.ok) {
      setMsg(`Listed ✓ Token #${data.tokenId} — ${data.dropUrl}`);
      setForm({ title: '', description: '', price_usdc: '5', edition_size: '10' });
      setFile(null);
      setCreating(false);
      load();
    } else {
      setMsg(`Error: ${data.error}`);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xs font-mono uppercase tracking-widest text-white/40">Products</h2>
        {canSelfList ? (
          <button
            onClick={() => setCreating(!creating)}
            className="text-xs border border-white/30 px-4 py-1.5 hover:border-white transition-all"
          >
            {creating ? 'Cancel' : '+ Add Product'}
          </button>
        ) : (
          <span className="text-xs font-mono text-amber-400/60">
            Self-listing cap reached ({brand?.max_self_listings})
          </span>
        )}
      </div>

      {brand && (
        <p className="text-xs text-white/20 font-mono mb-4">
          Self-listings: {brand.self_listings_used} / {brand.max_self_listings}
        </p>
      )}

      {msg && (
        <div className="mb-4 p-3 border border-white/20 bg-white/5 text-xs font-mono text-white/80">
          {msg}
        </div>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="mb-8 p-6 border border-white/20 space-y-4">
          <h3 className="text-sm font-medium mb-2">New Product</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Title *</label>
              <input
                type="text" required maxLength={60}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Image (JPEG/PNG) *</label>
              <input
                type="file" required
                accept="image/jpeg,image/jpg,image/png"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-white/40 file:bg-white/10 file:border-0 file:px-3 file:py-2
                           file:text-white file:text-xs file:mr-3 file:cursor-pointer"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Price (USDC) *</label>
              <input
                type="number" required min={0.5} max={50} step={0.5}
                value={form.price_usdc}
                onChange={(e) => setForm({ ...form, price_usdc: e.target.value })}
                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/40 block mb-1">Edition Size *</label>
              <input
                type="number" required min={1} max={50}
                value={form.edition_size}
                onChange={(e) => setForm({ ...form, edition_size: e.target.value })}
                className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-mono text-white/40 block mb-1">Description</label>
            <textarea
              rows={3} maxLength={280}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={acting}
            className="px-6 py-2 bg-white text-black text-sm font-medium hover:bg-white/90
                       disabled:opacity-40 transition-all"
          >
            {acting ? 'Listing on-chain…' : 'List Product →'}
          </button>
          <p className="text-xs text-white/20">
            This will register the drop on-chain and make it immediately purchasable.
          </p>
        </form>
      )}

      {loading ? (
        <p className="text-white/20 text-xs font-mono">Loading…</p>
      ) : drops.length === 0 ? (
        <p className="text-white/20 text-xs font-mono">No products listed yet.</p>
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
              <a
                href={`/rrg/drop/${d.token_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/30 hover:text-white transition-colors"
              >
                View ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sales Tab ─────────────────────────────────────────────────────
function SalesTab({ brandId }: { brandId: string }) {
  const [stats,         setStats]         = useState<SalesStats | null>(null);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    fetch(`/api/brand/${brandId}/sales`)
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats || null);
        setDistributions(d.distributions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [brandId]);

  const splitLabel = (s: string) => {
    const labels: Record<string, string> = {
      'challenge_35_35_30':  'Challenge',
      'brand_product_70_30': 'Product',
      'rrg_challenge_35_65': 'RRG Challenge',
      'legacy_70_30':        'Legacy',
    };
    return labels[s] || s;
  };

  return (
    <div>
      <h2 className="text-xs font-mono uppercase tracking-widest text-white/40 mb-6">Sales</h2>

      {loading ? (
        <p className="text-white/20 text-xs font-mono">Loading…</p>
      ) : (
        <>
          {/* Summary */}
          {stats && (
            <div className="mb-6 p-4 border border-white/10 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs font-mono text-white/30 mb-1">Total Sales</p>
                <p className="text-lg font-medium">{stats.totalSales}</p>
              </div>
              <div>
                <p className="text-xs font-mono text-white/30 mb-1">Total Revenue</p>
                <p className="text-lg font-medium">${stats.totalRevenue.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs font-mono text-white/30 mb-1">Your Share</p>
                <p className="text-lg font-medium text-green-400">${stats.brandRevenue.toFixed(2)}</p>
              </div>
            </div>
          )}

          {/* Distribution list */}
          {distributions.length === 0 ? (
            <p className="text-white/20 text-xs font-mono">No sales yet.</p>
          ) : (
            <div className="space-y-3">
              {distributions.map((d) => (
                <div key={d.id} className="p-4 border border-white/10">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono text-white/50">
                      {splitLabel(d.split_type)}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-mono px-2 py-0.5 ${
                        d.status === 'completed' ? 'bg-green-400/20 text-green-400' :
                        d.status === 'pending'   ? 'bg-amber-400/20 text-amber-400' :
                                                   'bg-red-400/20 text-red-400'
                      }`}>
                        {d.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-white/20 font-mono">
                        {new Date(d.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <span className="text-white/40">
                      Total: <span className="text-white">${parseFloat(d.total_usdc).toFixed(2)}</span>
                    </span>
                    <span className="text-white/40">
                      Your share: <span className="text-green-400">${parseFloat(d.brand_usdc).toFixed(2)}</span>
                    </span>
                    <span className="text-white/40">
                      Platform: <span className="text-amber-400">${parseFloat(d.platform_usdc).toFixed(2)}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────
function SettingsTab({ brandId }: { brandId: string }) {
  const [brand,   setBrand]   = useState<BrandSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState('');
  const [form,    setForm]    = useState({
    name: '', headline: '', description: '', website_url: '', contact_email: '',
  });

  useEffect(() => {
    fetch(`/api/brand/${brandId}/settings`)
      .then((r) => r.json())
      .then((d) => {
        if (d.brand) {
          setBrand(d.brand);
          setForm({
            name:          d.brand.name || '',
            headline:      d.brand.headline || '',
            description:   d.brand.description || '',
            website_url:   d.brand.website_url || '',
            contact_email: d.brand.contact_email || '',
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [brandId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    const res = await fetch(`/api/brand/${brandId}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      setMsg('Settings saved ✓');
      setBrand(data.brand);
    } else {
      setMsg(`Error: ${data.error}`);
    }
  };

  if (loading) return <p className="text-white/20 text-xs font-mono">Loading…</p>;
  if (!brand) return <p className="text-white/20 text-xs font-mono">Brand not found.</p>;

  return (
    <div>
      <h2 className="text-xs font-mono uppercase tracking-widest text-white/40 mb-6">Settings</h2>

      {/* Read-only info */}
      <div className="mb-6 p-4 border border-white/10 space-y-2">
        <div className="flex gap-4 text-xs font-mono">
          <span className="text-white/40">Slug:</span>
          <span className="text-white/70">/{brand.slug}</span>
        </div>
        <div className="flex gap-4 text-xs font-mono">
          <span className="text-white/40">Wallet:</span>
          <span className="text-white/70">{brand.wallet_address}</span>
        </div>
        <div className="flex gap-4 text-xs font-mono">
          <span className="text-white/40">Self-listings:</span>
          <span className="text-white/70">{brand.self_listings_used} / {brand.max_self_listings}</span>
        </div>
      </div>

      {/* Editable fields */}
      <form onSubmit={handleSave} className="space-y-4 max-w-lg">
        <div>
          <label className="text-xs font-mono text-white/40 block mb-1">Name</label>
          <input
            type="text" required maxLength={100}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none"
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
          <label className="text-xs font-mono text-white/40 block mb-1">Description</label>
          <textarea
            rows={4} maxLength={1000}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full bg-transparent border border-white/20 px-3 py-2 text-sm focus:border-white outline-none resize-none"
          />
        </div>
        <div>
          <label className="text-xs font-mono text-white/40 block mb-1">Contact Email</label>
          <input
            type="email" required
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
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
        {msg && <p className="text-xs font-mono text-green-400">{msg}</p>}
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2 bg-white text-black text-sm font-medium hover:bg-white/90
                     disabled:opacity-40 transition-all"
        >
          {saving ? 'Saving…' : 'Save Settings →'}
        </button>
      </form>
    </div>
  );
}
