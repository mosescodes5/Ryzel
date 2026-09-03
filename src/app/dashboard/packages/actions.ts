'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUserWithRole } from '@/lib/permissions/permissions';
import {
  createPackage,
  addPackageEvent,
  getPackageByIdForUser,
  type PackageStatus
} from '@/lib/packages/package-service';

async function requireUser() {
  const { user } = await getCurrentUserWithRole();
  if (!user) throw new Error('Sign in required');
  return user;
}

export async function createPackageAction(formData: FormData) {
  const user = await requireUser();

  const pkg = await createPackage({
    customerName: String(formData.get('customer_name') ?? ''),
    customerEmail: String(formData.get('customer_email') ?? ''),
    customerPhone: String(formData.get('customer_phone') ?? ''),
    description: String(formData.get('description') ?? ''),
    origin: String(formData.get('origin') ?? ''),
    destination: String(formData.get('destination') ?? ''),
    estimatedDelivery: String(formData.get('estimated_delivery') ?? '') || undefined,
    createdBy: user.id
  });

  revalidatePath('/dashboard/packages');
  redirect(`/dashboard/packages/${pkg.id}`);
}

export async function addPackageEventAction(formData: FormData) {
  const user = await requireUser();

  const packageId = String(formData.get('package_id') ?? '');
  const status = String(formData.get('status') ?? '') as PackageStatus;
  const note = String(formData.get('note') ?? '');
  const location = String(formData.get('location') ?? '');

  if (!packageId || !status) throw new Error('Missing package or status');

  // A user may only add status updates to tracking numbers they created —
  // re-check ownership here rather than trusting the hidden form field.
  const owned = await getPackageByIdForUser(packageId, user.id);
  if (!owned) throw new Error('Package not found');

  await addPackageEvent({ packageId, status, note, location, createdBy: user.id });

  revalidatePath(`/dashboard/packages/${packageId}`);
  revalidatePath('/dashboard/packages');
}
