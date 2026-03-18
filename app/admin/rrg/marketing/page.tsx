'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────

interface MktAgentSummary {
  id: string;
  name: string;
  erc8004_id: number | null;
  commission_bps: number;
  total_candidates_found: number;
  total_outreach_sent: number;
  total_conversions: number;
  total_commission_usdc: number;
}

interface PipelineStats {
  totalCandidates: number;
  byTier: { hot: number; warm: number; cold: number; disqualified: number };
  byOutreachStatus: {
    pending: number; contacted: number; engaged: number;
    converted: number; declined: number; unresponsive: number;
  };
  totalOutreachSent: number;
  totalConversions: number;
  totalCommissionUsdc: number;
  pendingCommissionUsdc: number;
}

interface Candidate {
  id: string;
  created_at: string;
  chain: string;
  wallet_address: string | null;
  erc8004_id: number | null;
  name: string | null;
  platform: string | null;
  metadata_url: string | null;
  score: number;
  tier: string;
  scoring_notes: string | null;
  has_wallet: boolean;
  has_mcp: boolean;
  has_a2a: boolean;
  has_image_gen: boolean;
  outreach_status: string;
  contact_count: number;
  last_contacted: string | null;
}

interface DiscoveryRun {
  id: string;
  created_at: string;
  completed_at: string | null;
  source: string;
  chain: string;
  status: string;
  agents_scanned: number;
  new_candidates: number;
  updated_candidates: number;
  notes: string | null;
}

const CHAIN_OPTIONS = [
  { value: 'base', label: 'Base', agents: 18123 },
  { value: 'ethereum', label: 'Ethereum', agents: 14319 },
  { value: 'bnb', label: 'BNB Chain', agents: 36681 },
  { value: 'monad', label: 'Monad', agents: 8338 },
  { value: 'megaeth', label: 'MegaETH', agents: 8130 },
  { value: 'gnosis', label: 'Gnosis', agents: 3189 },
  { value: 'celo', label: 'Celo', agents: 1851 },
  { value: 'arbitrum', label: 'Arbitrum', agents: 656 },
  { value: 'optimism', label: 'Optimism', agents: 437 },
  { value: 'polygon', label: 'Polygon', agents: 228 },
  { value: 'avalanche', label: 'Avalanche', agents: 143 },
  { value: 'linea', label: 'Linea', agents: 109 },
  { value: 'scroll', label: 'Scroll', agents: 104 },
  { value: 'abstract', label: 'Abstract', agents: 50 },
];

type Tab = 'dashboard' | 'candidates' | 'discovery' | 'oracles' | 'outreach';

// ── Main Component ─────────────────────────────────────────────────────

export default function MarketingPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [tab, setTab] = useState<Tab>('dashboard');

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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) setAuthed(true);
    else setLoginErr('Invalid password');
  };

  if (authed === null) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="font-mono text-white/50">Loading…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 px-6">
          <h1 className="text-sm font-mono uppercase tracking-[0.3em] text-white/60 mb-6">
            Marketing Admin
          </h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-black border border-white/20 text-white px-4 py-2 font-mono text-sm focus:border-white/50 focus:outline-none"
          />
          <button
            type="submit"
            className="w-full bg-white text-black font-mono text-sm uppercase tracking-wider py-2 hover:bg-white/90 transition-colors cursor-pointer"
          >
            Login
          </button>
          {loginErr && <p className="text-red-400 text-xs font-mono">{loginErr}</p>}
        </form>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: 'Pipeline' },
    { key: 'candidates', label: 'Candidates' },
    { key: 'discovery', label: 'Discovery' },
    { key: 'oracles', label: 'Oracles' },
    { key: 'outreach', label: 'Outreach' },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <a href="/admin/rrg" className="text-white/40 text-xs font-mono hover:text-white/60">
            ← Admin
          </a>
          <h1 className="text-sm font-mono uppercase tracking-[0.3em]">
            Agent Marketing
          </h1>
        </div>
        <div className="flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1 text-xs font-mono uppercase tracking-wider border transition-colors cursor-pointer ${
                tab === t.key
                  ? 'border-white text-white bg-white/5'
                  : 'border-white/15 text-white/50 hover:text-white/80 hover:border-white/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="px-6 py-8 max-w-7xl mx-auto">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'candidates' && <CandidatesTab />}
        {tab === 'discovery' && <DiscoveryTab />}
        {tab === 'oracles' && <OraclesTab />}
        {tab === 'outreach' && <OutreachTab />}
      </main>
    </div>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────

function DashboardTab() {
  const [data, setData] = useState<{ marketing_agents: MktAgentSummary[]; pipeline: PipelineStats } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/rrg/admin/marketing/dashboard')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (!data) return <p className="text-white/50 font-mono text-sm">Failed to load dashboard</p>;

  const { pipeline: p, marketing_agents: agents } = data;

  return (
    <div className="space-y-8">
      {/* Pipeline overview */}
      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-4">Pipeline</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Candidates" value={p.totalCandidates} />
          <StatCard label="Outreach Sent" value={p.totalOutreachSent} />
          <StatCard label="Conversions" value={p.totalConversions} />
          <StatCard label="Commission (USDC)" value={`$${p.totalCommissionUsdc.toFixed(2)}`} />
        </div>
      </section>

      {/* Tier breakdown */}
      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-4">By Tier</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Hot" value={p.byTier.hot} color="text-red-400" />
          <StatCard label="Warm" value={p.byTier.warm} color="text-orange-400" />
          <StatCard label="Cold" value={p.byTier.cold} color="text-blue-400" />
          <StatCard label="Disqualified" value={p.byTier.disqualified} color="text-white/30" />
        </div>
      </section>

      {/* Outreach status */}
      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-4">Outreach Status</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {Object.entries(p.byOutreachStatus).map(([status, count]) => (
            <StatCard key={status} label={status} value={count} small />
          ))}
        </div>
      </section>

      {/* Marketing agents */}
      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-4">Marketing Agents</h2>
        <div className="border border-white/10">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-xs uppercase">
                <th className="text-left px-4 py-2">Agent</th>
                <th className="text-right px-4 py-2">ERC-8004</th>
                <th className="text-right px-4 py-2">Commission</th>
                <th className="text-right px-4 py-2">Found</th>
                <th className="text-right px-4 py-2">Outreach</th>
                <th className="text-right px-4 py-2">Conversions</th>
                <th className="text-right px-4 py-2">Earned</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-2 text-white">{a.name}</td>
                  <td className="px-4 py-2 text-right text-white/60">#{a.erc8004_id}</td>
                  <td className="px-4 py-2 text-right text-white/60">{(a.commission_bps / 100).toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right">{a.total_candidates_found}</td>
                  <td className="px-4 py-2 text-right">{a.total_outreach_sent}</td>
                  <td className="px-4 py-2 text-right">{a.total_conversions}</td>
                  <td className="px-4 py-2 text-right text-green-400">${a.total_commission_usdc.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pending commissions */}
      {p.pendingCommissionUsdc > 0 && (
        <section className="border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm font-mono text-yellow-400">
            Pending commissions: ${p.pendingCommissionUsdc.toFixed(2)} USDC
          </p>
        </section>
      )}
    </div>
  );
}

// ── Candidates Tab ─────────────────────────────────────────────────────

function CandidatesTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [tierFilter, setTierFilter] = useState('');
  const [outreachFilter, setOutreachFilter] = useState('');
  const [chainFilter, setChainFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: '25' });
    if (tierFilter) params.set('tier', tierFilter);
    if (outreachFilter) params.set('outreach', outreachFilter);
    if (chainFilter) params.set('chain', chainFilter);

    fetch(`/api/rrg/admin/marketing/candidates?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setCandidates(d.candidates);
        setTotalCount(d.pagination.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, tierFilter, outreachFilter, chainFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(totalCount / 25);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <select
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
          className="bg-black border border-white/20 text-white/80 text-xs font-mono px-3 py-1.5 focus:outline-none cursor-pointer"
        >
          <option value="">All Tiers</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
          <option value="disqualified">Disqualified</option>
        </select>
        <select
          value={outreachFilter}
          onChange={(e) => { setOutreachFilter(e.target.value); setPage(1); }}
          className="bg-black border border-white/20 text-white/80 text-xs font-mono px-3 py-1.5 focus:outline-none cursor-pointer"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="contacted">Contacted</option>
          <option value="engaged">Engaged</option>
          <option value="converted">Converted</option>
          <option value="declined">Declined</option>
          <option value="unresponsive">Unresponsive</option>
        </select>
        <select
          value={chainFilter}
          onChange={(e) => { setChainFilter(e.target.value); setPage(1); }}
          className="bg-black border border-white/20 text-white/80 text-xs font-mono px-3 py-1.5 focus:outline-none cursor-pointer"
        >
          <option value="">All Chains</option>
          {CHAIN_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <span className="text-xs text-white/40 font-mono ml-auto">
          {totalCount} candidates
        </span>
      </div>

      {loading ? <Loading /> : (
        <>
          <div className="border border-white/10 overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-xs uppercase">
                  <th className="text-left px-3 py-2">Agent</th>
                  <th className="text-center px-3 py-2">Chain</th>
                  <th className="text-left px-3 py-2">Wallet</th>
                  <th className="text-center px-3 py-2">Score</th>
                  <th className="text-center px-3 py-2">Tier</th>
                  <th className="text-center px-3 py-2">MCP</th>
                  <th className="text-center px-3 py-2">A2A</th>
                  <th className="text-center px-3 py-2">ImgGen</th>
                  <th className="text-center px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Contacts</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <div className="text-white">{c.name ?? '—'}</div>
                      {c.erc8004_id && (
                        <div className="text-xs text-white/30">#{c.erc8004_id}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs font-mono text-white/50">{c.chain}</span>
                    </td>
                    <td className="px-3 py-2 text-white/50 text-xs">
                      {c.wallet_address ? `${c.wallet_address.slice(0, 6)}…${c.wallet_address.slice(-4)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ScoreBadge score={c.score} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <TierBadge tier={c.tier} />
                    </td>
                    <td className="px-3 py-2 text-center">{c.has_mcp ? '✓' : '—'}</td>
                    <td className="px-3 py-2 text-center">{c.has_a2a ? '✓' : '—'}</td>
                    <td className="px-3 py-2 text-center">{c.has_image_gen ? '✓' : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={c.outreach_status} />
                    </td>
                    <td className="px-3 py-2 text-right text-white/50">{c.contact_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-white/20 text-xs font-mono text-white/60 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >
                ← Prev
              </button>
              <span className="text-xs font-mono text-white/40 px-3 py-1">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border border-white/20 text-xs font-mono text-white/60 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Discovery Tab ──────────────────────────────────────────────────────

function DiscoveryTab() {
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState('base');

  const loadRuns = useCallback(() => {
    fetch('/api/rrg/admin/marketing/discovery')
      .then((r) => r.json())
      .then((d) => {
        setRuns(d.runs ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const startScan = async (maxScan: number, fromStart = false) => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/rrg/admin/marketing/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: selectedChain,
          max_scan: maxScan,
          ...(fromStart ? { start_id: 1 } : {}),
        }),
      });
      const d = await res.json();
      if (d.ok) {
        if (d.mode === 'background') {
          setScanResult(d.message);
        } else {
          setScanResult(
            `[${d.chain}] Scanned ${d.agents_scanned} agents: ${d.new_candidates} new, ${d.updated_candidates} updated` +
            (d.errors > 0 ? `, ${d.errors} errors` : ''),
          );
        }
        loadRuns();
      } else {
        setScanResult(`Error: ${d.error}`);
      }
    } catch (err) {
      setScanResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanning(false);
    }
  };

  const chainInfo = CHAIN_OPTIONS.find((c) => c.value === selectedChain);

  return (
    <div className="space-y-6">
      {/* Chain selector */}
      <section className="flex items-center gap-4 flex-wrap">
        <select
          value={selectedChain}
          onChange={(e) => setSelectedChain(e.target.value)}
          className="bg-black border border-white/30 text-white text-xs font-mono px-3 py-1.5 focus:outline-none cursor-pointer"
        >
          {CHAIN_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label} (~{c.agents.toLocaleString()} agents)
            </option>
          ))}
        </select>
        {chainInfo && (
          <span className="text-xs font-mono text-white/40">
            ~{chainInfo.agents.toLocaleString()} registered agents on {chainInfo.label}
          </span>
        )}
      </section>

      {/* Scan controls */}
      <section className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => startScan(100)}
          disabled={scanning}
          className="px-4 py-1.5 border border-white/30 text-xs font-mono uppercase tracking-wider text-white/70 hover:text-white hover:border-white/60 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
        >
          {scanning ? 'Scanning…' : 'Scan Next 100'}
        </button>
        <button
          onClick={() => startScan(500)}
          disabled={scanning}
          className="px-4 py-1.5 border border-white/30 text-xs font-mono uppercase tracking-wider text-white/70 hover:text-white hover:border-white/60 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
        >
          {scanning ? 'Scanning…' : 'Scan Next 500'}
        </button>
        <button
          onClick={() => startScan(5000)}
          disabled={scanning}
          className="px-4 py-1.5 border border-white/30 text-xs font-mono uppercase tracking-wider text-white/70 hover:text-white hover:border-white/60 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
        >
          {scanning ? 'Scanning…' : 'Scan Next 5,000'}
        </button>
        <button
          onClick={() => startScan(20000)}
          disabled={scanning}
          className="px-4 py-1.5 border border-white/30 text-xs font-mono uppercase tracking-wider text-white/70 hover:text-white hover:border-white/60 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
        >
          {scanning ? 'Scanning…' : 'Full Scan 20k'}
        </button>
        <span className="text-white/10">|</span>
        <button
          onClick={() => startScan(30000, true)}
          disabled={scanning}
          className="px-4 py-1.5 border border-yellow-500/30 text-xs font-mono uppercase tracking-wider text-yellow-400/70 hover:text-yellow-400 hover:border-yellow-500/50 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
        >
          {scanning ? 'Scanning…' : 'Rescan All (re-score)'}
        </button>
      </section>

      {scanResult && (
        <div className={`border px-4 py-2 text-xs font-mono ${
          scanResult.startsWith('Error') || scanResult.startsWith('Failed')
            ? 'border-red-500/30 text-red-400'
            : 'border-green-500/30 text-green-400'
        }`}>
          {scanResult}
        </div>
      )}

      {/* Run history */}
      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-4">
          Discovery Runs
        </h2>
        {loading ? <Loading /> : (
          <div className="border border-white/10">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-xs uppercase">
                  <th className="text-left px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2">Chain</th>
                  <th className="text-left px-3 py-2">Source</th>
                  <th className="text-center px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Scanned</th>
                  <th className="text-right px-3 py-2">New</th>
                  <th className="text-right px-3 py-2">Updated</th>
                  <th className="text-left px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2 text-white/60 text-xs">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-white/60">{r.chain ?? 'base'}</td>
                    <td className="px-3 py-2 text-white/60">{r.source}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs ${
                        r.status === 'completed' ? 'text-green-400' :
                        r.status === 'failed' ? 'text-red-400' :
                        'text-yellow-400'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{r.agents_scanned}</td>
                    <td className="px-3 py-2 text-right text-green-400">{r.new_candidates}</td>
                    <td className="px-3 py-2 text-right text-blue-400">{r.updated_candidates}</td>
                    <td className="px-3 py-2 text-white/40 text-xs truncate max-w-[200px]">
                      {r.notes ?? '—'}
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-white/30 text-sm">
                      No discovery runs yet. Click &quot;Scan&quot; to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Oracles Tab ───────────────────────────────────────────────────────

interface OracleConfig {
  id: string;
  name: string;
  description: string;
  source: string;
  supportsChain: boolean;
  defaultChain: string;
  rateLimit: string;
}

function OraclesTab() {
  const [oracles, setOracles] = useState<OracleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  // RNWY controls
  const [rnwyChain, setRnwyChain] = useState('all');
  const [rnwyLimit, setRnwyLimit] = useState(100);
  const [rnwyPage, setRnwyPage] = useState(1);

  // MCP Registry controls
  const [mcpSearch, setMcpSearch] = useState('image art creative design generate');
  const [mcpLimit, setMcpLimit] = useState(50);

  // ag0 controls
  const [ag0Chain, setAg0Chain] = useState('all');
  const [ag0Limit, setAg0Limit] = useState(100);
  const [ag0Name, setAg0Name] = useState('');

  // ClawPlaza controls
  const [clawMaxJobs, setClawMaxJobs] = useState(200);

  useEffect(() => {
    fetch('/api/rrg/admin/marketing/oracles')
      .then((r) => r.json())
      .then((d) => setOracles(d.oracles ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const runOracle = async (oracleId: string) => {
    setScanning(true);
    setScanResult(null);
    try {
      const body: Record<string, unknown> = { oracle: oracleId };

      if (oracleId === 'rnwy') {
        body.chain = rnwyChain;
        body.limit = rnwyLimit;
        body.page = rnwyPage;
      } else if (oracleId === 'mcp_registry') {
        body.search = mcpSearch;
        body.limit = mcpLimit;
      } else if (oracleId === 'ag0_sdk') {
        body.chain = ag0Chain;
        body.limit = ag0Limit;
        if (ag0Name.trim()) body.name = ag0Name.trim();
      } else if (oracleId === 'clawplaza') {
        body.max_jobs = clawMaxJobs;
      }

      const res = await fetch('/api/rrg/admin/marketing/oracles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.ok) {
        setScanResult(
          `${oracleId.toUpperCase()}: ${d.agents_scanned} scanned, ` +
          `${d.new_candidates} new, ${d.updated_candidates} updated` +
          (d.errors > 0 ? `, ${d.errors} errors` : ''),
        );
      } else {
        setScanResult(`Error: ${d.error}`);
      }
    } catch (err) {
      setScanResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanning(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <p className="text-xs text-white/50 font-mono">
        External data sources beyond ERC-8004 chain scanning. Each oracle enriches the candidate pipeline
        with agents from different registries and directories.
      </p>

      {/* RNWY Explorer */}
      <section className="border border-white/10 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-mono text-white">RNWY Explorer</h3>
            <p className="text-xs text-white/40 font-mono mt-1">
              124K+ agents with reputation scores, MCP/A2A endpoints, x402 support. Public API, 60 req/hr.
            </p>
          </div>
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-[10px] font-mono text-white/30 uppercase mb-1">Chain</label>
            <select
              value={rnwyChain}
              onChange={(e) => setRnwyChain(e.target.value)}
              className="bg-black border border-white/20 text-white text-xs font-mono px-2 py-1"
            >
              <option value="all">All Chains (124K+)</option>
              {CHAIN_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-white/30 uppercase mb-1">Limit</label>
            <input
              type="number"
              value={rnwyLimit}
              onChange={(e) => setRnwyLimit(parseInt(e.target.value) || 100)}
              min={10}
              max={500}
              className="bg-black border border-white/20 text-white text-xs font-mono px-2 py-1 w-20"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-white/30 uppercase mb-1">Page</label>
            <input
              type="number"
              value={rnwyPage}
              onChange={(e) => setRnwyPage(parseInt(e.target.value) || 1)}
              min={1}
              className="bg-black border border-white/20 text-white text-xs font-mono px-2 py-1 w-16"
            />
          </div>
          <button
            onClick={() => runOracle('rnwy')}
            disabled={scanning}
            className="px-4 py-1.5 border border-purple-500/40 text-xs font-mono uppercase text-purple-400 hover:bg-purple-500/10 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
          >
            {scanning ? 'Scanning…' : 'Scan RNWY'}
          </button>
        </div>
      </section>

      {/* MCP Registry */}
      <section className="border border-white/10 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-mono text-white">MCP Registry</h3>
          <p className="text-xs text-white/40 font-mono mt-1">
            Official MCP server catalogue. Search for servers with creative/art capabilities.
          </p>
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-mono text-white/30 uppercase mb-1">Search</label>
            <input
              type="text"
              value={mcpSearch}
              onChange={(e) => setMcpSearch(e.target.value)}
              className="bg-black border border-white/20 text-white text-xs font-mono px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-white/30 uppercase mb-1">Limit</label>
            <input
              type="number"
              value={mcpLimit}
              onChange={(e) => setMcpLimit(parseInt(e.target.value) || 50)}
              min={5}
              max={96}
              className="bg-black border border-white/20 text-white text-xs font-mono px-2 py-1 w-20"
            />
          </div>
          <button
            onClick={() => runOracle('mcp_registry')}
            disabled={scanning}
            className="px-4 py-1.5 border border-cyan-500/40 text-xs font-mono uppercase text-cyan-400 hover:bg-cyan-500/10 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
          >
            {scanning ? 'Scanning…' : 'Scan MCP'}
          </button>
        </div>
      </section>

      {/* ag0 Subgraph */}
      <section className="border border-white/10 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-mono text-white">ag0 Subgraph</h3>
          <p className="text-xs text-white/40 font-mono mt-1">
            Multi-chain ERC-8004 agent search via The Graph. Filters by name, active status, MCP tools, A2A skills.
          </p>
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-[10px] font-mono text-white/30 uppercase mb-1">Chain</label>
            <select
              value={ag0Chain}
              onChange={(e) => setAg0Chain(e.target.value)}
              className="bg-black border border-white/20 text-white text-xs font-mono px-2 py-1"
            >
              <option value="all">All Chains</option>
              <option value="base">Base</option>
              <option value="ethereum">Ethereum</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-white/30 uppercase mb-1">Limit</label>
            <input
              type="number"
              value={ag0Limit}
              onChange={(e) => setAg0Limit(parseInt(e.target.value) || 100)}
              min={10}
              max={500}
              className="bg-black border border-white/20 text-white text-xs font-mono px-2 py-1 w-20"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-white/30 uppercase mb-1">Name Filter</label>
            <input
              type="text"
              value={ag0Name}
              onChange={(e) => setAg0Name(e.target.value)}
              placeholder="optional"
              className="bg-black border border-white/20 text-white text-xs font-mono px-2 py-1 w-32"
            />
          </div>
          <button
            onClick={() => runOracle('ag0_sdk')}
            disabled={scanning}
            className="px-4 py-1.5 border border-green-500/40 text-xs font-mono uppercase text-green-400 hover:bg-green-500/10 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
          >
            {scanning ? 'Scanning…' : 'Scan ag0'}
          </button>
        </div>
      </section>

      {/* ClawPlaza / IACP */}
      <section className="border border-white/10 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-mono text-white">ClawPlaza / IACP</h3>
          <p className="text-xs text-white/40 font-mono mt-1">
            ERC-8183 bounty marketplace on Base. Scans on-chain jobs for active creative providers and clients.
          </p>
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-[10px] font-mono text-white/30 uppercase mb-1">Max Jobs</label>
            <input
              type="number"
              value={clawMaxJobs}
              onChange={(e) => setClawMaxJobs(parseInt(e.target.value) || 200)}
              min={10}
              max={1000}
              className="bg-black border border-white/20 text-white text-xs font-mono px-2 py-1 w-20"
            />
          </div>
          <button
            onClick={() => runOracle('clawplaza')}
            disabled={scanning}
            className="px-4 py-1.5 border border-amber-500/40 text-xs font-mono uppercase text-amber-400 hover:bg-amber-500/10 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
          >
            {scanning ? 'Scanning…' : 'Scan ClawPlaza'}
          </button>
        </div>
      </section>

      {/* Planned oracles */}
      <section className="border border-white/5 p-4">
        <h3 className="text-sm font-mono text-white/30">Planned Oracles</h3>
        <ul className="text-xs text-white/20 font-mono mt-2 space-y-1">
          <li>Olas Service Registry — on-chain autonomous services</li>
          <li>AstraSync KYA — verified agent identities + trust scores</li>
          <li>A2A Agent Card crawler — /.well-known/agent.json discovery</li>
          <li>x402scan — active agent commerce endpoints</li>
          <li>Virtuals Protocol — tokenized creative agents on Base</li>
        </ul>
      </section>

      {scanResult && (
        <div className={`border px-4 py-2 text-xs font-mono ${
          scanResult.startsWith('Error') || scanResult.startsWith('Failed')
            ? 'border-red-500/30 text-red-400'
            : 'border-green-500/30 text-green-400'
        }`}>
          {scanResult}
        </div>
      )}
    </div>
  );
}

// ── Outreach Tab ───────────────────────────────────────────────────────

function OutreachTab() {
  const [sending, setSending] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);

  const sendBatch = async (tier: string, limit: number) => {
    setSending(true);
    setBatchResult(null);
    try {
      const res = await fetch('/api/rrg/admin/marketing/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, channel: 'manual', limit }),
      });
      const d = await res.json();
      if (d.ok) {
        setBatchResult(`Sent: ${d.sent}, Failed: ${d.failed}`);
      } else {
        setBatchResult(`Error: ${d.error}`);
      }
    } catch (err) {
      setBatchResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-4">
          Batch Outreach
        </h2>
        <p className="text-xs text-white/50 font-mono mb-4">
          Send intro messages to top candidates by tier. Currently records outreach for manual follow-up.
          x402 and A2A channels coming soon.
        </p>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => sendBatch('hot', 10)}
            disabled={sending}
            className="px-4 py-1.5 border border-red-500/40 text-xs font-mono uppercase text-red-400 hover:bg-red-500/10 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
          >
            {sending ? 'Sending…' : 'Hot × 10'}
          </button>
          <button
            onClick={() => sendBatch('warm', 10)}
            disabled={sending}
            className="px-4 py-1.5 border border-orange-500/40 text-xs font-mono uppercase text-orange-400 hover:bg-orange-500/10 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
          >
            {sending ? 'Sending…' : 'Warm × 10'}
          </button>
          <button
            onClick={() => sendBatch('cold', 10)}
            disabled={sending}
            className="px-4 py-1.5 border border-blue-500/40 text-xs font-mono uppercase text-blue-400 hover:bg-blue-500/10 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
          >
            {sending ? 'Sending…' : 'Cold × 10'}
          </button>
        </div>
      </section>

      {batchResult && (
        <div className={`border px-4 py-2 text-xs font-mono ${
          batchResult.startsWith('Error') || batchResult.startsWith('Failed')
            ? 'border-red-500/30 text-red-400'
            : 'border-green-500/30 text-green-400'
        }`}>
          {batchResult}
        </div>
      )}

      <section className="border border-white/10 px-4 py-6 text-center">
        <p className="text-white/30 text-sm font-mono">
          Outreach history and per-candidate detail view coming in next iteration.
        </p>
      </section>
    </div>
  );
}

// ── Shared Components ──────────────────────────────────────────────────

function Loading() {
  return <p className="text-white/50 font-mono text-sm py-8 text-center">Loading…</p>;
}

function StatCard({
  label, value, color, small,
}: {
  label: string; value: number | string; color?: string; small?: boolean;
}) {
  return (
    <div className={`border border-white/10 px-4 ${small ? 'py-2' : 'py-3'}`}>
      <div className={`${small ? 'text-lg' : 'text-2xl'} font-mono ${color ?? 'text-white'}`}>
        {value}
      </div>
      <div className="text-xs text-white/40 font-mono uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    hot: 'text-red-400 border-red-400/30',
    warm: 'text-orange-400 border-orange-400/30',
    cold: 'text-blue-400 border-blue-400/30',
    disqualified: 'text-white/30 border-white/10',
  };
  return (
    <span className={`text-xs font-mono uppercase px-2 py-0.5 border ${colors[tier] ?? 'text-white/50 border-white/20'}`}>
      {tier}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  let color = 'text-blue-400';
  if (score >= 70) color = 'text-red-400';
  else if (score >= 40) color = 'text-orange-400';
  return <span className={`text-sm font-mono ${color}`}>{score}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'text-white/40',
    contacted: 'text-yellow-400',
    engaged: 'text-orange-400',
    converted: 'text-green-400',
    declined: 'text-red-400',
    unresponsive: 'text-white/20',
  };
  return (
    <span className={`text-xs font-mono ${colors[status] ?? 'text-white/40'}`}>
      {status}
    </span>
  );
}
