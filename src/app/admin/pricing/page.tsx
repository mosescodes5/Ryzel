import { redirect } from 'next/navigation';

// Pricing management moved into the main dashboard (Admin > Pricing in the
// sidebar at /dashboard) so admins can manage it without leaving the
// dashboard shell. This keeps old bookmarks/links working.
export default function LegacyAdminPricingRedirect() {
  redirect('/dashboard/admin/pricing');
}
