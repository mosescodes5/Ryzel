'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/permissions/permissions';
import { createPackage, addPackageEvent, updatePackageDetails, type PackageStatus } from '@/lib/packages/package-service';

export async function createPackageAction(formData: FormData) {
  const admin = await requireAdmin();

  const pkg = await createPackage({
    customerName: String(formData.get('customer_name') ?? ''),
    customerEmail: String(formData.get('customer_email') ?? ''),
    customerPhone: String(formData.get('customer_phone') ?? ''),
    description: String(formData.get('description') ?? ''),
    origin: String(formData.get('origin') ?? ''),
    destination: String(formData.get('destination') ?? ''),
    estimatedDelivery: String(formData.get('estimated_delivery') ?? '') || undefined,
    createdBy: admin.id
  });

  revalidatePath('/dashboard/admin/packages');
  redirect(`/dashboard/admin/packages/${pkg.id}`);
}

export async function addPackageEventAction(formData: FormData) {
  const admin = await requireAdmin();

  const packageId = String(formData.get('package_id') ?? '');
  const status = String(formData.get('status') ?? '') as PackageStatus;
  const note = String(formData.get('note') ?? '');
  const location = String(formData.get('location') ?? '');

  if (!packageId || !status) throw new Error('Missing package or status');

  await addPackageEvent({ packageId, status, note, location, createdBy: admin.id });

  revalidatePath(`/dashboard/admin/packages/${packageId}`);
  revalidatePath('/dashboard/admin/packages');
}

export async function updatePackageDetailsAction(formData: FormData) {
  await requireAdmin();

  const packageId = String(formData.get('package_id') ?? '');
  if (!packageId) throw new Error('Missing package id');

  await updatePackageDetails(packageId, {
    customerName: String(formData.get('customer_name') ?? ''),
    customerEmail: String(formData.get('customer_email') ?? ''),
    customerPhone: String(formData.get('customer_phone') ?? ''),
    description: String(formData.get('description') ?? ''),
    origin: String(formData.get('origin') ?? ''),
    destination: String(formData.get('destination') ?? ''),
    estimatedDelivery: String(formData.get('estimated_delivery') ?? '')
  });

  revalidatePath(`/dashboard/admin/packages/${packageId}`);
}
