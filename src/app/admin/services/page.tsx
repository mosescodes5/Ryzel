import { redirect } from 'next/navigation';

export default function LegacyAdminServicesRedirect() {
  redirect('/dashboard/admin/services');
}
