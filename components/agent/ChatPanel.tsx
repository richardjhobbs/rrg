'use client';

import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TIER_DISPLAY } from '@/lib/agent/types';
import { CHAT_COST_ESTIMATE } from '@/lib/agent/credits';
import type { Agent } from '@/lib/agent/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface Props {
  agent: Agent;
}

export function ChatPanel({ agent }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [evalMode, setEvalMode] = useState(false);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tierLabel = TIER_DISPLAY[agent.tier].label;

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function newConversation() {
    setMessages([]);
    setSessionId(crypto.randomUUID());
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: text }]);

    // Add placeholder for assistant
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    try {
      const res = await fetch(`/api/agent/${agent.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          is_eval_preview: evalMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `Error: ${data.error || 'Chat failed'}`,
          };
          return updated;
        });
        setSending(false);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No stream');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const text = JSON.parse(data) as string;
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...last,
                content: last.content + text,
              };
              return updated;
            });
          } catch {
            // ignore parse errors
          }
        }
      }

      // Mark streaming complete
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          streaming: false,
        };
        return updated;
      });
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Connection error. Please try again.',
        };
        return updated;
      });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (agent.tier !== 'pro') return null;

  return (
    <Card className="md:col-span-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 cursor-pointer"
        >
          <h2 className="text-base font-semibold">Chat with {agent.name}</h2>
          <span className="text-xs text-white/30">{open ? '▲' : '▼'}</span>
        </button>
        <span className="text-xs text-white/40 flex items-center gap-1">
          {CHAT_COST_ESTIMATE[agent.llm_provider] ?? '~$0.003'} per message
          <span className="relative group">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-white/20 text-[10px] text-white/40 cursor-help">?</span>
            <span className="absolute bottom-full right-0 mb-1 w-48 p-2 text-[10px] text-white/70 bg-neutral-800 border border-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              Estimate only — charged according to LLM provider
            </span>
          </span>
        </span>
      </div>

      {open && (
        <div className="mt-4">
          {/* Controls bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setEvalMode(!evalMode)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                  evalMode
                    ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                    : 'border-white/15 text-white/40 hover:text-white/60'
                }`}
              >
                {evalMode ? 'Eval mode on' : 'Eval mode'}
              </button>
              {evalMode && (
                <span className="text-xs text-white/30">Describe a drop to get your {tierLabel}&apos;s evaluation</span>
              )}
            </div>
            <button
              onClick={newConversation}
              className="text-xs text-white/40 hover:text-white/60 transition-colors cursor-pointer"
            >
              New conversation
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="h-80 overflow-y-auto border border-white/10 rounded-lg p-3 mb-3 space-y-3"
          >
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-xs">
                  <p className="text-sm text-white/30 mb-3">
                    Say hello to {agent.name}.<br />
                    <span className="text-xs">Your {tierLabel} is ready to chat.</span>
                  </p>
                  <p className="text-xs text-white/20 leading-relaxed">
                    {agent.name} will learn more about your style and taste as you converse.
                    Let {agent.name} know about brands and products that interest you and they
                    will remember and be more selective on your behalf when shopping.
                  </p>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-green-500/15 text-green-100 border border-green-500/20'
                      : 'bg-white/5 text-white/80 border border-white/10'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content || (msg.streaming ? '...' : '')}</div>
                  {msg.streaming && msg.content && (
                    <span className="inline-block w-1.5 h-3.5 bg-white/40 animate-pulse ml-0.5" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={evalMode ? 'Describe a drop to evaluate...' : `Message ${agent.name}...`}
              disabled={sending}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-green-500/50 disabled:opacity-50"
            />
            <Button size="sm" onClick={send} loading={sending} disabled={!input.trim()}>
              Send
            </Button>
          </div>

          {/* Credit info */}
          <div className="mt-2 text-xs text-white/30 flex justify-between">
            <span>Credits: ${agent.credit_balance_usdc.toFixed(2)}</span>
            <span>{agent.llm_provider}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
