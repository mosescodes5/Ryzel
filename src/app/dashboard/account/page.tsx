import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { DCard, DButton, PageHeader } from '@/components/dashboard/ui';
import { updateNotifyPhone } from './actions';

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, display_name, role, notify_phone_number, created_at')
    .eq('id', user.id)
    .single();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Account" description="Your profile and notification preferences." />

      <DCard className="max-w-md">
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-800">{profile?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Role</dt>
            <dd className="flex items-center gap-1.5 font-medium capitalize text-slate-800">
              {profile?.role === 'admin' && <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />}
              {profile?.role}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Member since</dt>
            <dd className="font-medium text-slate-800">
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
            </dd>
          </div>
        </dl>
      </DCard>

      <DCard className="max-w-md">
        <p className="text-sm font-medium text-slate-900">SMS notifications</p>
        <p className="mt-1 text-xs text-slate-500">
          We'll text this number the moment one of your numbers receives a code — no need to keep
          the dashboard open.
        </p>
        <form action={updateNotifyPhone} className="mt-4 flex gap-2">
          <input
            type="tel"
            name="notify_phone_number"
            placeholder="+15551234567"
            defaultValue={profile?.notify_phone_number ?? ''}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <DButton type="submit">Save</DButton>
        </form>
      </DCard>
    </div>
  );
}
