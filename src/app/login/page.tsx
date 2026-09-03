'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { AuthShell } from '@/components/auth/auth-shell';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNeedsConfirmation(false);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (signInError) {
      // Supabase's message for this case is literally "Email not confirmed".
      if (signInError.message.toLowerCase().includes('email not confirmed')) {
        setNeedsConfirmation(true);
      } else {
        setError(signInError.message);
      }
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function handleResend() {
    setResendStatus('sending');
    await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` }
    });
    setResendStatus('sent');
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}

        {needsConfirmation && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="text-amber-600">Confirm your email before signing in.</p>
            {resendStatus === 'sent' ? (
              <p className="mt-1 text-slate-500">Confirmation email resent — check your inbox.</p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resendStatus === 'sending'}
                className="mt-1 text-brand-600"
              >
                {resendStatus === 'sending' ? 'Sending…' : 'Resend confirmation email'}
              </button>
            )}
          </div>
        )}

        <Button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <div className="mt-6 flex justify-between text-sm text-slate-500">
        <Link href="/signup" className="text-brand-600">
          Create an account
        </Link>
        <Link href="/forgot-password" className="text-brand-600">
          Forgot password?
        </Link>
      </div>
    </AuthShell>
  );
}
