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
  reachableCount: number;
  unreachableCount: number;
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
  discovery_source: string | null;
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
  reachable: boolean;
  verified_endpoint: string | null;
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
  { value: 'base', label: 'Base' },
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'bnb', label: 'BNB Chain' },
  { value: 'monad', label: 'Monad' },
  { value: 'megaeth', label: 'MegaETH' },
  { value: 'gnosis', label: 'Gnosis' },
  { value: 'celo', label: 'Celo' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'optimism', label: 'Optimism' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'avalanche', label: 'Avalanche' },
  { value: 'linea', label: 'Linea' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'abstract', label: 'Abstract' },
];

type Tab = 'dashboard' | 'reachable' | 'discovery' | 'outreach';

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
        <p className="font-mono text-white/50">Loading...</p>
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
    { key: 'reachable', label: 'Reachable Agents' },
    { key: 'discovery', label: 'Discovery' },
    { key: 'outreach', label: 'Outreach' },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <a href="/admin/rrg" className="text-white/40 text-xs font-mono hover:text-white/60">
            &larr; Admin
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
        {tab === 'reachable' && <ReachableTab />}
        {tab === 'discovery' && <DiscoveryTab />}
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
  const reachPct = p.totalCandidates > 0
    ? ((p.reachableCount / p.totalCandidates) * 100).toFixed(2)
    : '0';

  return (
    <div className="space-y-8">
      {/* Key metrics */}
      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-4">Pipeline Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Scanned" value={p.totalCandidates.toLocaleString()} />
          <StatCard label="Reachable" value={p.reachableCount} color="text-green-400" />
          <StatCard label="Reachable %" value={`${reachPct}%`} color="text-green-400" />
          <StatCard label="Unreachable" value={p.unreachableCount.toLocaleString()} color="text-white/30" />
        </div>
      </section>

      {/* Outreach funnel - reachable agents only */}
      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-4">
          Reachable Agent Funnel
        </h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {Object.entries(p.byOutreachStatus).map(([status, count]) => (
            <StatCard key={status} label={status} value={count} small />
          ))}
        </div>
      </section>

      {/* Outreach stats */}
      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-4">Performance</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Outreach Sent" value={p.totalOutreachSent} />
          <StatCard label="Conversions" value={p.totalConversions} color="text-green-400" />
          <StatCard label="Commission (USDC)" value={`$${p.totalCommissionUsdc.toFixed(2)}`} />
          {p.pendingCommissionUsdc > 0 && (
            <StatCard label="Pending (USDC)" value={`$${p.pendingCommissionUsdc.toFixed(2)}`} color="text-yellow-400" />
          )}
        </div>
      </section>

      {/* Marketing agents */}
      {agents.length > 0 && (
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
      )}
    </div>
  );
}

// ── Reachable Agents Tab ──────────────────────────────────────────────

function ReachableTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [outreachFilter, setOutreachFilter] = useState('');
  const [chainFilter, setChainFilter] = useState('');
  const [reachableFilter, setReachableFilter] = useState('true');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: '25' });
    if (outreachFilter) params.set('outreach', outreachFilter);
    if (chainFilter) params.set('chain', chainFilter);
    if (reachableFilter) params.set('reachable', reachableFilter);

    fetch(`/api/rrg/admin/marketing/candidates?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setCandidates(d.candidates);
        setTotalCount(d.pagination.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, outreachFilter, chainFilter, reachableFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(totalCount / 25);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <select
          value={reachableFilter}
          onChange={(e) => { setReachableFilter(e.target.value); setPage(1); }}
          className="bg-black border border-white/20 text-white/80 text-xs font-mono px-3 py-1.5 focus:outline-none cursor-pointer"
        >
          <option value="true">Reachable Only</option>
          <option value="">All Agents</option>
          <option value="false">Unreachable</option>
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
          {totalCount.toLocaleString()} agents
        </span>
      </div>

      {loading ? <Loading /> : (
        <>
          <div className="border border-white/10 overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-xs uppercase">
                  <th className="text-left px-3 py-2">Agent</th>
                  <th className="text-center px-3 py-2">ERC-8004</th>
                  <th className="text-center px-3 py-2">Chain</th>
                  <th className="text-center px-3 py-2">Score</th>
                  <th className="text-center px-3 py-2">Reachable</th>
                  <th className="text-left px-3 py-2">Verified Endpoint</th>
                  <th className="text-center px-3 py-2">MCP</th>
                  <th className="text-center px-3 py-2">A2A</th>
                  <th className="text-center px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Contacts</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <div className="text-white">{c.name ?? '---'}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {c.erc8004_id ? (
                        <a
                          href={`https://8004scan.io/agents/${c.chain || 'base'}/${c.erc8004_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-white/50 hover:text-white/90 transition-colors"
                        >
                          #{c.erc8004_id}
                        </a>
                      ) : (
                        <span className="text-white/20">---</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs font-mono text-white/50">{c.chain}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ScoreBadge score={c.score} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {c.reachable ? (
                        <span className="text-green-400 text-xs">YES</span>
                      ) : (
                        <span className="text-white/20 text-xs">no</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.verified_endpoint ? (
                        <span className="text-green-400/70 truncate block max-w-[250px]" title={c.verified_endpoint}>
                          {c.verified_endpoint}
                        </span>
                      ) : (
                        <span className="text-white/15">---</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">{c.has_mcp ? 'Y' : '---'}</td>
                    <td className="px-3 py-2 text-center">{c.has_a2a ? 'Y' : '---'}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={c.outreach_status} />
                    </td>
                    <td className="px-3 py-2 text-right text-white/50">{c.contact_count}</td>
                  </tr>
                ))}
                {candidates.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-white/30 text-sm">
                      No agents found. Run the verify-reachable script to populate.
                    </td>
                  </tr>
                )}
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
                &larr; Prev
              </button>
              <span className="text-xs font-mono text-white/40 px-3 py-1">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border border-white/20 text-xs font-mono text-white/60 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >
                Next &rarr;
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
              {c.label}
            </option>
          ))}
        </select>
      </section>

      {/* Scan controls */}
      <section className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => startScan(500)}
          disabled={scanning}
          className="px-4 py-1.5 border border-white/30 text-xs font-mono uppercase tracking-wider text-white/70 hover:text-white hover:border-white/60 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
        >
          {scanning ? 'Scanning...' : 'Scan 500'}
        </button>
        <button
          onClick={() => startScan(5000)}
          disabled={scanning}
          className="px-4 py-1.5 border border-white/30 text-xs font-mono uppercase tracking-wider text-white/70 hover:text-white hover:border-white/60 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
        >
          {scanning ? 'Scanning...' : 'Scan 5,000'}
        </button>
        <button
          onClick={() => startScan(20000)}
          disabled={scanning}
          className="px-4 py-1.5 border border-white/30 text-xs font-mono uppercase tracking-wider text-white/70 hover:text-white hover:border-white/60 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
        >
          {scanning ? 'Scanning...' : 'Full Scan 20k'}
        </button>
        <span className="text-white/10">|</span>
        <button
          onClick={() => startScan(30000, true)}
          disabled={scanning}
          className="px-4 py-1.5 border border-yellow-500/30 text-xs font-mono uppercase tracking-wider text-yellow-400/70 hover:text-yellow-400 hover:border-yellow-500/50 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
        >
          {scanning ? 'Scanning...' : 'Rescan All'}
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

      {/* Note about reachable verification */}
      <div className="border border-white/10 bg-white/5 px-4 py-3 text-xs font-mono text-white/50">
        Discovery scans pull agents from 8004scan. After scanning, run the <code className="text-white/70">verify-reachable</code> script
        on VPS to check on-chain tokenURI and mark agents with real A2A/MCP endpoints as reachable.
      </div>

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
                      {r.notes ?? '---'}
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-white/30 text-sm">
                      No discovery runs yet.
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

// ── Outreach Tab ───────────────────────────────────────────────────────

interface OutreachRecord {
  id: string;
  created_at: string;
  candidate_id: string;
  channel: string;
  message_type: string;
  status: string;
  cost_usdc: number;
  response_preview: string | null;
  candidate: {
    name: string | null;
    erc8004_id: number | null;
    chain: string;
    tier: string;
    wallet_address: string | null;
    has_mcp: boolean;
    has_a2a: boolean;
    has_image_gen: boolean;
    outreach_status: string;
  } | null;
}

interface OutreachDashboard {
  total: number;
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
  byMessageType: Record<string, number>;
  deliveryRate: string;
  bounceRate: string;
  totalCostUsdc: number;
  today: { total: number; delivered: number };
  recent: OutreachRecord[];
}

function OutreachTab() {
  const [sending, setSending] = useState(false);
  const [batchResult, setBatchResult] = useState<{
    summary?: { delivered: number; bounced: number; sent: number; failed: number; total: number };
    error?: string;
  } | null>(null);
  const [dashboard, setDashboard] = useState<OutreachDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [batchSize, setBatchSize] = useState(50);
  const [selectedChannel, setSelectedChannel] = useState<string>('a2a');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/rrg/admin/marketing/outreach');
      if (res.ok) {
        const data = await res.json();
        setDashboard(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const sendBatch = async () => {
    setSending(true);
    setBatchResult(null);
    try {
      const res = await fetch('/api/rrg/admin/marketing/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: selectedChannel, limit: batchSize }),
      });
      const d = await res.json();
      if (d.ok) {
        setBatchResult({ summary: d.summary });
        setTimeout(loadDashboard, 1000);
      } else {
        setBatchResult({ error: d.error });
      }
    } catch (err) {
      setBatchResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Loading />;

  const statusColor = (s: string) => {
    switch (s) {
      case 'delivered': return 'text-green-400';
      case 'bounced': return 'text-yellow-400';
      case 'failed': return 'text-red-400';
      case 'sent': return 'text-blue-400';
      default: return 'text-white/40';
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard label="Total Sent" value={dashboard.total} />
          <StatCard label="Delivered" value={dashboard.byStatus['delivered'] ?? 0} color="text-green-400" />
          <StatCard label="Bounced" value={dashboard.byStatus['bounced'] ?? 0} color="text-yellow-400" />
          <StatCard label="Failed" value={dashboard.byStatus['failed'] ?? 0} color="text-red-400" />
          <StatCard label="Delivery %" value={`${dashboard.deliveryRate}%`} color="text-green-400" />
          <StatCard label="Today" value={`${dashboard.today.delivered}/${dashboard.today.total}`} color="text-blue-400" />
        </div>
      )}

      {/* Batch Controls */}
      <section className="border border-white/10 p-4">
        <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-4">
          Send to Reachable Agents
        </h2>
        <p className="text-xs text-white/40 font-mono mb-4">
          Sends outreach only to verified reachable agents (reachable=true, status=pending).
        </p>
        <div className="flex items-end gap-4 flex-wrap mb-4">
          <div>
            <label className="text-[10px] font-mono text-white/30 uppercase block mb-1">Channel</label>
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              className="bg-black border border-white/20 text-white text-xs font-mono px-3 py-1.5"
            >
              <option value="a2a">A2A</option>
              <option value="mcp">MCP</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono text-white/30 uppercase block mb-1">Batch Size</label>
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))}
              className="bg-black border border-white/20 text-white text-xs font-mono px-3 py-1.5 w-24"
            />
          </div>
          <button
            onClick={sendBatch}
            disabled={sending}
            className="px-6 py-1.5 border border-green-500/40 text-xs font-mono uppercase text-green-400 hover:bg-green-500/10 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-default"
          >
            {sending ? 'Sending...' : `Send x${batchSize}`}
          </button>
        </div>

        {batchResult && (
          <div className={`mt-4 border px-4 py-3 text-xs font-mono ${
            batchResult.error ? 'border-red-500/30 text-red-400' : 'border-green-500/30'
          }`}>
            {batchResult.error ? (
              <span className="text-red-400">{batchResult.error}</span>
            ) : batchResult.summary ? (
              <div className="grid grid-cols-5 gap-4">
                <div><span className="text-white/40">Total:</span> <span className="text-white">{batchResult.summary.total}</span></div>
                <div><span className="text-white/40">Delivered:</span> <span className="text-green-400">{batchResult.summary.delivered}</span></div>
                <div><span className="text-white/40">Bounced:</span> <span className="text-yellow-400">{batchResult.summary.bounced}</span></div>
                <div><span className="text-white/40">Sent:</span> <span className="text-blue-400">{batchResult.summary.sent}</span></div>
                <div><span className="text-white/40">Failed:</span> <span className="text-red-400">{batchResult.summary.failed}</span></div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Recent Outreach Log */}
      {dashboard && dashboard.recent.length > 0 && (
        <section>
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-4">
            Recent Outreach ({dashboard.recent.length})
          </h2>
          <div className="border border-white/10 overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-left">
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">ERC-8004</th>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Caps</th>
                  <th className="px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recent.map((r) => (
                  <>
                    <tr
                      key={r.id}
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    >
                      <td className="px-3 py-2 text-white/80 max-w-[200px] truncate">
                        {r.candidate?.name ?? '---'}
                      </td>
                      <td className="px-3 py-2 text-white/50">
                        {r.candidate?.erc8004_id ? (
                          <a href={`https://8004scan.io/agents/${r.candidate.chain || 'base'}/${r.candidate.erc8004_id}`} target="_blank" rel="noopener noreferrer" className="hover:text-white/90 transition-colors">#{r.candidate.erc8004_id}</a>
                        ) : '---'}
                      </td>
                      <td className="px-3 py-2 text-white/50">{r.channel}</td>
                      <td className="px-3 py-2 text-white/50">{r.message_type}</td>
                      <td className={`px-3 py-2 ${statusColor(r.status)}`}>
                        {r.status}
                      </td>
                      <td className="px-3 py-2 text-white/30">
                        {[
                          r.candidate?.has_mcp && 'MCP',
                          r.candidate?.has_a2a && 'A2A',
                          r.candidate?.has_image_gen && 'IMG',
                        ].filter(Boolean).join(' ') || '---'}
                      </td>
                      <td className="px-3 py-2 text-white/30">
                        {r.created_at ? new Date(r.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '---'}
                      </td>
                    </tr>
                    {expandedId === r.id && r.response_preview && (
                      <tr key={`${r.id}-detail`}>
                        <td colSpan={7} className="px-3 py-2 bg-white/5">
                          <pre className="text-[10px] text-white/40 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                            {r.response_preview}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Shared Components ──────────────────────────────────────────────────

function Loading() {
  return <p className="text-white/50 font-mono text-sm py-8 text-center">Loading...</p>;
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
