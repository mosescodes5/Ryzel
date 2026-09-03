'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { AuthShell } from '@/components/auth/auth-shell';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    // Show "sent" regardless of whether the email exists — don't leak
    // which addresses have accounts.
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell>
        <h1 className="text-2xl font-semibold text-slate-900">Check your email</h1>
        <p className="mt-3 text-sm text-slate-500">
          If an account exists for <span className="text-slate-900">{email}</span>, a password
          reset link is on its way.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold text-slate-900">Reset your password</h1>
      <p className="mt-2 text-sm text-slate-500">We'll email you a link to set a new one.</p>
      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-slate-500">
        <Link href="/login" className="text-brand-600">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
