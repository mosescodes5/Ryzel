import { redirect } from 'next/navigation';

export default function LegacyAdminUsersRedirect() {
  redirect('/dashboard/admin/users');
}
