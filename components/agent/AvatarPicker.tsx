'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { PRESET_AVATARS, AVATAR_GENERATION_COST_USDC } from '@/lib/agent/avatars';
import type { Agent } from '@/lib/agent/types';

type Tab = 'gallery' | 'upload' | 'generate';

interface Props {
  agent: Agent;
  onAvatarChange: (avatar: { avatar_path: string; avatar_url: string; avatar_source: string }) => void;
  onClose: () => void;
}

export function AvatarPicker({ agent, onAvatarChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('gallery');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function selectPreset(presetId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/${agent.id}/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: presetId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      onAvatarChange(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set avatar');
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('File must be under 2MB');
      return;
    }

    setError(null);
    setPreviewFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function uploadFile() {
    if (!previewFile) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('avatar', previewFile);

      const res = await fetch(`/api/agent/${agent.id}/avatar`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      onAvatarChange(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  async function generateAvatar() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/${agent.id}/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generate: true }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json();
      onAvatarChange(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  async function removeAvatar() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/${agent.id}/avatar`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      onAvatarChange({ avatar_path: '', avatar_url: '', avatar_source: 'none' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setLoading(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'gallery', label: 'Gallery' },
    { key: 'upload', label: 'Upload' },
    ...(agent.tier === 'pro' ? [{ key: 'generate' as Tab, label: 'Generate' }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-neutral-900 border border-white/10 rounded-xl w-full max-w-md mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Choose avatar</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white cursor-pointer">✕</button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-4 p-1 bg-white/5 rounded-lg">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setError(null); setPreview(null); }}
              className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                tab === t.key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-3 p-2 rounded bg-red-900/30 border border-red-800 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Gallery tab */}
        {tab === 'gallery' && (
          <div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {PRESET_AVATARS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => selectPreset(preset.id)}
                  disabled={loading}
                  className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors cursor-pointer ${
                    agent.avatar_source === 'preset' && agent.avatar_path === preset.id
                      ? 'border-green-500'
                      : 'border-transparent hover:border-white/30'
                  }`}
                  title={preset.label}
                >
                  <img src={preset.src} alt={preset.label} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Upload tab */}
        {tab === 'upload' && (
          <div className="space-y-3">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-white/20 rounded-lg p-6 text-center cursor-pointer hover:border-white/40 transition-colors"
            >
              {preview ? (
                <img src={preview} alt="Preview" className="w-24 h-24 mx-auto rounded-full object-cover mb-2" />
              ) : (
                <div className="text-white/30 mb-2">
                  <div className="text-2xl mb-1">+</div>
                  <div className="text-xs">Click to choose an image</div>
                </div>
              )}
              <div className="text-xs text-white/30">JPEG, PNG, or WebP. Max 2MB.</div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
            {preview && (
              <Button size="sm" onClick={uploadFile} loading={loading} className="w-full">
                Use this image
              </Button>
            )}
          </div>
        )}

        {/* Generate tab */}
        {tab === 'generate' && (
          <div className="space-y-3 text-center py-4">
            <p className="text-sm text-white/60">
              Generate a unique avatar based on your Concierge&apos;s persona using AI.
            </p>
            <p className="text-xs text-white/30">
              Cost: ${AVATAR_GENERATION_COST_USDC} USDC from your credit balance
            </p>
            <p className="text-xs text-white/40">
              Balance: ${agent.credit_balance_usdc.toFixed(4)} USDC
            </p>
            <Button
              size="sm"
              onClick={generateAvatar}
              loading={loading}
              disabled={agent.credit_balance_usdc < AVATAR_GENERATION_COST_USDC}
            >
              {loading ? 'Generating...' : 'Generate avatar'}
            </Button>
            {agent.credit_balance_usdc < AVATAR_GENERATION_COST_USDC && (
              <p className="text-xs text-red-400">Insufficient credits</p>
            )}
          </div>
        )}

        {/* Remove button */}
        {agent.avatar_source !== 'none' && (
          <div className="mt-4 pt-3 border-t border-white/10">
            <button
              onClick={removeAvatar}
              disabled={loading}
              className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
            >
              Remove avatar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
