import { redirect } from 'next/navigation';
import { Layers } from 'lucide-react';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import { createAdminClient } from '@/lib/supabase/server';
import { DCard, DButton, PageHeader } from '@/components/dashboard/ui';
import { toggleServiceActive } from './actions';

export default async function DashboardAdminServicesPage() {
  const { user, role } = await getCurrentUserWithRole();
  if (!user) redirect('/login');
  if (role !== 'admin') redirect('/dashboard');

  const admin = createAdminClient();
  const { data: services } = await admin.from('services').select('*').order('category');

  const rows = services ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Services"
        description="Enable or disable a marketplace tool platform-wide. New ones appear here as soon as they register a row in the services table — no code change needed to launch or retire one."
      />

      <div className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <DCard>
            <p className="text-sm text-slate-500">No services configured yet.</p>
          </DCard>
        ) : (
          rows.map((service) => (
            <DCard key={service.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Layers className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-slate-900">{service.name}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{service.category}</p>
                </div>
              </div>
              <form
                action={async () => {
                  'use server';
                  await toggleServiceActive(service.id, !service.active);
                }}
              >
                <DButton type="submit" variant={service.active ? 'secondary' : 'success'}>
                  {service.active ? 'Disable' : 'Enable'}
                </DButton>
              </form>
            </DCard>
          ))
        )}
      </div>
    </div>
  );
}
