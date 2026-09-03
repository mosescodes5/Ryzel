import { redirect } from 'next/navigation';

export default function LegacyAdminOrdersRedirect() {
  redirect('/dashboard/admin/orders');
}
