'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { Agent } from '@/lib/agent/types';

interface LlmStatus {
  provider: string;
  label: string;
  model: string;
  color: string;
  api_key_configured: boolean;
  cost_per_eval: number;
  chat_cost_estimate: string;
  credit_balance: number;
  estimated_evals_remaining: number;
}

interface Props {
  agent: Agent;
}

export function LlmStatusCard({ agent }: Props) {
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latency_ms?: number; error?: string } | null>(null);

  useEffect(() => {
    fetch(`/api/agent/${agent.id}/llm-status`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }, [agent.id, agent.llm_provider]);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/agent/${agent.id}/llm-status`, { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, error: 'Connection error' });
    } finally {
      setTesting(false);
    }
  }

  if (agent.tier !== 'pro') return null;

  return (
    <Card>
      <h2 className="text-base font-semibold mb-4">LLM Provider</h2>

      {!status ? (
        <div className="text-sm text-white/40 animate-pulse">Loading...</div>
      ) : (
        <div className="space-y-3 text-sm">
          {/* Provider + status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: status.api_key_configured ? '#22c55e' : '#eab308' }}
              />
              <span className="text-white/90 font-medium">{status.label}</span>
            </div>
            <span className="text-xs text-white/40">{status.model}</span>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              status.api_key_configured
                ? 'border-green-500/30 text-green-400'
                : 'border-yellow-500/30 text-yellow-400'
            }`}>
              {status.api_key_configured ? 'Connected' : 'No API key'}
            </span>
          </div>

          {/* Cost info */}
          <div className="border-t border-white/10 pt-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Per evaluation</span>
              <span className="text-white/70">${status.cost_per_eval.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Per chat message</span>
              <span className="text-white/70">{status.chat_cost_estimate}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Evals remaining</span>
              <span className="text-white/70">{status.estimated_evals_remaining.toLocaleString()}</span>
            </div>
          </div>

          {/* Test connection */}
          <div className="border-t border-white/10 pt-3">
            <Button size="sm" variant="ghost" onClick={testConnection} loading={testing}>
              Test connection
            </Button>
            {testResult && (
              <div className={`mt-2 text-xs ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
                {testResult.success
                  ? `Connected (${testResult.latency_ms}ms)`
                  : `Failed: ${testResult.error}`
                }
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
