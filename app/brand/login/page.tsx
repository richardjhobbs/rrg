'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function BrandLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isReset = searchParams.get('reset') === 'true';
  const accessToken  = searchParams.get('access_token');
  const refreshToken = searchParams.get('refresh_token');

  const [mode,     setMode]     = useState<'login' | 'forgot' | 'reset'>(
    isReset && accessToken ? 'reset' : 'login'
  );
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [newPass,  setNewPass]  = useState('');
  const [msg,      setMsg]      = useState('');
  const [err,      setErr]      = useState('');
  const [loading,  setLoading]  = useState(false);

  // Check if already logged in
  useEffect(() => {
    fetch('/api/brand/auth/check')
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.brands?.length > 0) {
          router.push(`/brand/${d.brands[0].brandSlug}/admin`);
        }
      })
      .catch(() => {});
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setLoading(true);

    const res = await fetch('/api/brand/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok && data.brands?.length > 0) {
      router.push(`/brand/${data.brands[0].brandSlug}/admin`);
    } else {
      setErr(data.error || 'Login failed');
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setLoading(true);

    const res = await fetch('/api/brand/auth/forgot-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setMsg(data.message);
    } else {
      setErr(data.error || 'Failed');
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setLoading(true);

    const res = await fetch('/api/brand/auth/reset-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        access_token:  accessToken,
        refresh_token: refreshToken,
        password:      newPass,
      }),
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setMsg('Password updated. Redirecting…');
      setTimeout(() => router.push('/brand/login'), 1500);
    } else {
      setErr(data.error || 'Failed to reset password');
    }
  };

  return (
    <div className="w-full max-w-sm px-6">
      <h1 className="text-xs font-mono uppercase tracking-[0.3em] text-white/40 mb-8">
        Brand Admin
      </h1>

      {mode === 'login' && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-mono text-white/40 block mb-1">Email</label>
            <input
              type="email" required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                         focus:border-white outline-none transition-colors placeholder:text-white/20"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-mono text-white/40 block mb-1">Password</label>
            <input
              type="password" required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                         focus:border-white outline-none transition-colors placeholder:text-white/20"
            />
          </div>
          {err && <p className="text-red-400 text-xs font-mono">{err}</p>}
          {msg && <p className="text-green-400 text-xs font-mono">{msg}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-white text-black text-sm font-medium hover:bg-white/90
                       disabled:opacity-40 transition-all"
          >
            {loading ? 'Logging in…' : 'Login →'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('forgot'); setErr(''); setMsg(''); }}
            className="w-full text-xs text-white/30 hover:text-white/60 transition-colors font-mono"
          >
            Forgot password?
          </button>
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={handleForgot} className="space-y-4">
          <p className="text-xs text-white/50 mb-4">
            Enter your email and we&apos;ll send a reset link.
          </p>
          <input
            type="email" required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                       focus:border-white outline-none transition-colors placeholder:text-white/20"
            autoFocus
          />
          {err && <p className="text-red-400 text-xs font-mono">{err}</p>}
          {msg && <p className="text-green-400 text-xs font-mono">{msg}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-white text-black text-sm font-medium hover:bg-white/90
                       disabled:opacity-40 transition-all"
          >
            {loading ? 'Sending…' : 'Send Reset Link →'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('login'); setErr(''); setMsg(''); }}
            className="w-full text-xs text-white/30 hover:text-white/60 transition-colors font-mono"
          >
            ← Back to login
          </button>
        </form>
      )}

      {mode === 'reset' && (
        <form onSubmit={handleReset} className="space-y-4">
          <p className="text-xs text-white/50 mb-4">
            Choose a new password (min 8 characters).
          </p>
          <input
            type="password" required minLength={8}
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="New password"
            className="w-full bg-transparent border border-white/20 px-4 py-3 text-sm
                       focus:border-white outline-none transition-colors placeholder:text-white/20"
            autoFocus
          />
          {err && <p className="text-red-400 text-xs font-mono">{err}</p>}
          {msg && <p className="text-green-400 text-xs font-mono">{msg}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-white text-black text-sm font-medium hover:bg-white/90
                       disabled:opacity-40 transition-all"
          >
            {loading ? 'Updating…' : 'Set New Password →'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function BrandLoginPage() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <Suspense fallback={
        <div className="text-xs font-mono text-white/30">Loading…</div>
      }>
        <BrandLoginInner />
      </Suspense>
    </div>
  );
}
