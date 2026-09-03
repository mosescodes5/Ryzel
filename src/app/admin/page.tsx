import { redirect } from 'next/navigation';

// Admin moved into the main dashboard shell (light theme, consistent with
// the rest of the app) — see src/app/dashboard/admin/*. Kept here so old
// bookmarks/links to /admin keep working.
export default function LegacyAdminOverviewRedirect() {
  redirect('/dashboard/admin');
}
