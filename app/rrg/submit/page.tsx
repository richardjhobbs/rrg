'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Brief {
  title: string;
  description: string;
  deadline?: string;
}

type Status = 'idle' | 'submitting' | 'success' | 'error';

export default function SubmitPage() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    creator_wallet: '',
    creator_email: '',
  });
  const [jpeg, setJpeg] = useState<File | null>(null);
  const [additionalFiles, setAdditionalFiles] = useState<FileList | null>(null);

  useEffect(() => {
    fetch('/api/rrg/brief')
      .then((r) => r.json())
      .then((d) => setBrief(d.brief))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jpeg) { setError('Please attach a JPEG image.'); return; }

    setStatus('submitting');
    setError('');

    const fd = new FormData();
    fd.append('title', form.title);
    fd.append('description', form.description);
    fd.append('creator_wallet', form.creator_wallet);
    fd.append('creator_email', form.creator_email);
    fd.append('jpeg', jpeg);
    if (additionalFiles) {
      for (let i = 0; i < additionalFiles.length; i++) {
        fd.append('additional_files', additionalFiles[i]);
      }
    }

    try {
      const res = await fetch('/api/rrg/submit', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setStatus('success');
    } catch (err: unknown) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
  };

  if (status === 'success') {
    return (
      <div className="px-6 py-32 max-w-xl mx-auto text-center">
        <div className="text-5xl mb-6 opacity-60">✓</div>
        <h2 className="text-xl font-light mb-4">Submission received</h2>
        <p className="text-white/40 text-sm leading-relaxed mb-10">
          We&apos;ll review your design and notify you at the email provided if it&apos;s
          approved for a drop. This usually takes 2–5 days.
        </p>
        <Link
          href="/rrg"
          className="text-sm border border-white/30 px-6 py-2.5 hover:border-white transition-all"
        >
          ← Back to Gallery
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-12 max-w-2xl mx-auto">

      {/* Brief context */}
      {brief && (
        <div className="mb-10 p-5 border border-white/10 bg-white/3 text-sm">
          <p className="font-mono text-xs uppercase tracking-widest text-white/30 mb-1">
            Responding to
          </p>
          <p className="font-medium text-white">{brief.title}</p>
          <p className="text-white/40 mt-1 text-xs leading-relaxed">{brief.description}</p>
        </div>
      )}

      <h1 className="text-xl font-mono tracking-wider mb-8">Submit a Design</h1>

      <form onSubmit={handleSubmit} className="space-y-7">

        {/* Title */}
        <div>
          <label className="block text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-2">
            Title *
          </label>
          <input
            type="text"
            required
            maxLength={120}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                       focus:border-white outline-none transition-colors placeholder:text-white/20"
            placeholder="Give your design a title"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-2">
            Description
          </label>
          <textarea
            rows={4}
            maxLength={1000}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                       focus:border-white outline-none transition-colors resize-none placeholder:text-white/20"
            placeholder="Materials, process, inspiration — anything relevant"
          />
        </div>

        {/* Main JPEG */}
        <div>
          <label className="block text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-2">
            Main Image (JPEG) *
          </label>
          <input
            type="file"
            accept="image/jpeg,image/jpg"
            required
            onChange={(e) => setJpeg(e.target.files?.[0] || null)}
            className="w-full border border-white/20 px-4 py-3 text-sm text-white/50
                       file:mr-4 file:bg-white file:text-black file:border-0
                       file:px-3 file:py-1 file:text-xs file:font-medium file:cursor-pointer
                       file:hover:bg-white/90 transition-all"
          />
          <p className="mt-1.5 text-xs text-white/20">
            JPEG only · max 20 MB · high-resolution preferred
          </p>
        </div>

        {/* Additional files */}
        <div>
          <label className="block text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-2">
            Additional Files <span className="normal-case tracking-normal text-white/20">(optional)</span>
          </label>
          <input
            type="file"
            multiple
            onChange={(e) => setAdditionalFiles(e.target.files)}
            className="w-full border border-white/20 px-4 py-3 text-sm text-white/50
                       file:mr-4 file:bg-white file:text-black file:border-0
                       file:px-3 file:py-1 file:text-xs file:font-medium file:cursor-pointer
                       file:hover:bg-white/90 transition-all"
          />
          <p className="mt-1.5 text-xs text-white/20">
            ZIP, PDF, SVG, AI, PSD etc. · Delivered to buyers post-purchase · max 50 MB total
          </p>
        </div>

        {/* Creator wallet */}
        <div>
          <label className="block text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-2">
            Creator Wallet (Base) *
          </label>
          <input
            type="text"
            required
            pattern="^0x[0-9a-fA-F]{40}$"
            title="A valid 0x Ethereum address"
            value={form.creator_wallet}
            onChange={(e) => setForm({ ...form, creator_wallet: e.target.value })}
            className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm font-mono
                       focus:border-white outline-none transition-colors placeholder:text-white/20"
            placeholder="0x…"
          />
          <p className="mt-1.5 text-xs text-white/20">
            70% of each sale is transferred here as USDC on Base
          </p>
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-2">
            Contact Email *
          </label>
          <input
            type="email"
            required
            value={form.creator_email}
            onChange={(e) => setForm({ ...form, creator_email: e.target.value })}
            className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                       focus:border-white outline-none transition-colors placeholder:text-white/20"
            placeholder="you@example.com"
          />
          <p className="mt-1.5 text-xs text-white/20">
            We&apos;ll notify you when your design is approved for a drop
          </p>
        </div>

        {/* Error */}
        {(status === 'error' || error) && (
          <p className="text-red-400 text-sm font-mono border border-red-400/20 bg-red-400/5 px-4 py-3">
            {error}
          </p>
        )}

        {/* Submit */}
        <div className="flex items-center gap-5 pt-2">
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="px-8 py-3 bg-white text-black text-sm font-medium
                       hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {status === 'submitting' ? 'Submitting…' : 'Submit Design →'}
          </button>
          <Link href="/rrg" className="text-sm text-white/30 hover:text-white transition-colors">
            Cancel
          </Link>
        </div>

        <p className="text-xs text-white/20 pt-2 leading-relaxed">
          By submitting you confirm this is original work and you hold the rights to it.
          If approved, an edition of 1–50 copies will be listed as an ERC-1155 token on Base.
          Creators receive 70% of each sale in USDC.
        </p>
      </form>
    </div>
  );
}
