'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { AuthShell } from '@/components/auth/auth-shell';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Supabase's "Confirm email" project setting decides whether a
        // confirmation email is actually sent. If it is, the link points
        // here and /auth/callback exchanges it for a real session.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`
      }
    });

    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // The `profiles` row is created automatically by a DB trigger
    // (handle_new_auth_user) — no client-side insert needed here.

    if (!data.session) {
      // Email confirmation is required on this project — there's no
      // session yet, so there's nothing to send them into the dashboard
      // with. Show the "check your email" state instead of a redirect
      // that would just bounce off the auth guard.
      setAwaitingConfirmation(true);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  if (awaitingConfirmation) {
    return (
      <AuthShell>
        <h1 className="text-2xl font-semibold text-slate-900">Check your email</h1>
        <p className="mt-3 text-sm text-slate-500">
          We sent a confirmation link to <span className="text-slate-900">{email}</span>. Click it
          to finish creating your account.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold text-slate-900">Create your account</h1>
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
          minLength={8}
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-600">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
