import { createAdminClient, createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export type PackageStatus = Database['public']['Tables']['packages']['Row']['status'];

export type PackageRecord = Database['public']['Tables']['packages']['Row'];
export type PackageEvent = Database['public']['Tables']['package_events']['Row'];

export const PACKAGE_STATUSES: { value: PackageStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'received', label: 'Received at facility' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'exception', label: 'Exception' },
  { value: 'cancelled', label: 'Cancelled' }
];

// Avoids visually-ambiguous characters (0/O, 1/I/L) so a customer reading a
// tracking number off a label or screenshot doesn't mistype it.
const TRACKING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomTrackingSuffix(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TRACKING_ALPHABET[Math.floor(Math.random() * TRACKING_ALPHABET.length)];
  }
  return out;
}

/** Generates a unique tracking number, e.g. "RYZ-7K4Q-9MXP". Retries on the rare collision. */
async function generateUniqueTrackingNumber(): Promise<string> {
  const admin = createAdminClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `RYZ-${randomTrackingSuffix(4)}-${randomTrackingSuffix(4)}`;
    const { data } = await admin.from('packages').select('id').eq('tracking_number', candidate).maybeSingle();
    if (!data) return candidate;
  }

  throw new Error('Could not generate a unique tracking number — try again.');
}

export async function createPackage(input: {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  description?: string;
  origin?: string;
  destination?: string;
  estimatedDelivery?: string;
  createdBy: string;
}): Promise<PackageRecord> {
  const admin = createAdminClient();
  const trackingNumber = await generateUniqueTrackingNumber();

  const { data, error } = await admin
    .from('packages')
    .insert({
      tracking_number: trackingNumber,
      customer_name: input.customerName || null,
      customer_email: input.customerEmail || null,
      customer_phone: input.customerPhone || null,
      description: input.description || null,
      origin: input.origin || null,
      destination: input.destination || null,
      estimated_delivery: input.estimatedDelivery || null,
      status: 'pending',
      created_by: input.createdBy
    })
    .select('*')
    .single();

  if (error || !data) throw error ?? new Error('Could not create package');

  // The creation itself is the first timeline entry, so the public tracking
  // page always has at least one event to show.
  await admin.from('package_events').insert({
    package_id: data.id,
    status: 'pending',
    note: 'Package created',
    created_by: input.createdBy
  });

  return data;
}

export async function addPackageEvent(input: {
  packageId: string;
  status: PackageStatus;
  note?: string;
  location?: string;
  createdBy: string;
}): Promise<void> {
  const admin = createAdminClient();

  const { error: eventError } = await admin.from('package_events').insert({
    package_id: input.packageId,
    status: input.status,
    note: input.note || null,
    location: input.location || null,
    created_by: input.createdBy
  });
  if (eventError) throw eventError;

  // Keep the package's headline status in sync with its latest event so
  // list views don't need to join against package_events just to show it.
  const { error: updateError } = await admin
    .from('packages')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', input.packageId);
  if (updateError) throw updateError;
}

export async function updatePackageDetails(
  packageId: string,
  input: Partial<{
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    description: string;
    origin: string;
    destination: string;
    estimatedDelivery: string;
  }>
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('packages')
    .update({
      ...(input.customerName !== undefined ? { customer_name: input.customerName || null } : {}),
      ...(input.customerEmail !== undefined ? { customer_email: input.customerEmail || null } : {}),
      ...(input.customerPhone !== undefined ? { customer_phone: input.customerPhone || null } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.origin !== undefined ? { origin: input.origin || null } : {}),
      ...(input.destination !== undefined ? { destination: input.destination || null } : {}),
      ...(input.estimatedDelivery !== undefined ? { estimated_delivery: input.estimatedDelivery || null } : {}),
      updated_at: new Date().toISOString()
    })
    .eq('id', packageId);
  if (error) throw error;
}

export async function listPackages(search?: string): Promise<PackageRecord[]> {
  const admin = createAdminClient();
  let query = admin.from('packages').select('*').order('created_at', { ascending: false }).limit(200);

  if (search && search.trim()) {
    const term = search.trim();
    query = query.or(`tracking_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_email.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data;
}

export async function getPackageById(id: string): Promise<{ pkg: PackageRecord; events: PackageEvent[] } | null> {
  const admin = createAdminClient();
  const [{ data: pkg }, { data: events }] = await Promise.all([
    admin.from('packages').select('*').eq('id', id).maybeSingle(),
    admin.from('package_events').select('*').eq('package_id', id).order('created_at', { ascending: true })
  ]);

  if (!pkg) return null;
  return { pkg, events: events ?? [] };
}

/** Packages created by (owned by) a given user — powers the self-service "Package Tracker" tool in the regular user dashboard, as opposed to the admin-only tracker which manages packages for arbitrary customers. */
export async function listPackagesForUser(userId: string): Promise<PackageRecord[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('packages')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data;
}

/** Same as getPackageById, but scoped to packages the given user created — used by the self-service dashboard so one user can't view or update another user's tracking numbers. */
export async function getPackageByIdForUser(
  id: string,
  userId: string
): Promise<{ pkg: PackageRecord; events: PackageEvent[] } | null> {
  const result = await getPackageById(id);
  if (!result || result.pkg.created_by !== userId) return null;
  return result;
}

/**
 * Shareable public tracking link shown to customers. Points at
 * track.ryzel.online — the branded ryzel-track frontend — which now reads
 * from this app's own `packages` table via GET /api/v1/track/[code]
 * (see src/app/api/v1/track/[code]/route.ts) instead of the old,
 * disconnected ryzel-worker backend it used to call. Configurable via
 * NEXT_PUBLIC_TRACK_URL in case that domain ever changes; this app's own
 * /track/[trackingNumber] page still works too (used by TrackSearchBox
 * and as a fallback) and resolves the exact same rows.
 */
export function publicTrackingUrl(trackingNumber: string): string {
  const base = (process.env.NEXT_PUBLIC_TRACK_URL ?? 'https://track.ryzel.online').replace(/\/$/, '');
  return `${base}/${trackingNumber}`;
}

/** Public lookup — used by the unauthenticated /track page. Uses the anon client, relying on the public-read RLS policy. */
export async function getPackageByTrackingNumber(
  trackingNumber: string
): Promise<{ pkg: PackageRecord; events: PackageEvent[] } | null> {
  const supabase = createClient();
  const normalized = trackingNumber.trim().toUpperCase();

  const { data: pkg } = await supabase.from('packages').select('*').eq('tracking_number', normalized).maybeSingle();
  if (!pkg) return null;

  const { data: events } = await supabase
    .from('package_events')
    .select('*')
    .eq('package_id', pkg.id)
    .order('created_at', { ascending: true });

  return { pkg, events: events ?? [] };
}
