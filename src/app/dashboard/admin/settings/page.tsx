import { redirect } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { DCard, DButton, PageHeader } from '@/components/dashboard/ui';
import { updateSiteSettings } from './actions';

export default async function DashboardSettingsPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) redirect('/login');
  if (role !== 'admin') redirect('/dashboard');

  const admin = createAdminClient();
  const { data: settings } = await admin.from('site_settings').select('*').eq('id', true).single();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Site-wide settings shown to every user on the dashboard."
      />

      <DCard className="max-w-md">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-900">WhatsApp community</p>
            <p className="text-xs text-slate-500">
              This link powers the "Join our WhatsApp community" card on the dashboard and the
              WhatsApp button in the sidebar. Leave it blank to hide both.
            </p>
          </div>
        </div>

        <form action={updateSiteSettings} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500">WhatsApp group invite link</label>
            <input
              type="url"
              name="whatsapp_group_link"
              placeholder="https://chat.whatsapp.com/your-invite-code"
              defaultValue={settings?.whatsapp_group_link ?? ''}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Must start with https://chat.whatsapp.com/ or https://wa.me/
            </p>
          </div>

          <DButton type="submit">Save settings</DButton>
        </form>
      </DCard>
    </div>
  );
}
