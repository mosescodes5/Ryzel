#!/usr/bin/env node
// fix-async-params.mjs
// Fixes Next.js 15 "async params" breakage across the dynamic route/page
// files identified in the ryzel project. Run from the project root:
//   node fix-async-params.mjs
//
// Uses exact string matching (not line numbers or regex) so it's safe to
// re-run — if a file's already fixed, that replacement is just skipped
// with a note, nothing gets double-applied or corrupted.

import { readFileSync, writeFileSync } from 'fs';

const fixes = [
  {
    file: 'src/app/api/v1/numbers/[id]/purchase/route.ts',
    replacements: [
      {
        old: `export async function POST(request: Request, { params }: { params: { id: string } }) {`,
        new: `export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {\n  const params = await props.params;`,
      },
    ],
  },
  {
    file: 'src/app/api/v1/track/[code]/route.ts',
    replacements: [
      {
        old: `export async function GET(request: Request, { params }: { params: { code: string } }) {`,
        new: `export async function GET(request: Request, props: { params: Promise<{ code: string }> }) {\n  const params = await props.params;`,
      },
    ],
  },
  {
    file: 'src/app/dashboard/admin/packages/[id]/page.tsx',
    replacements: [
      {
        old: `export default async function DashboardAdminPackageDetailPage({ params }: { params: { id: string } }) {`,
        new: `export default async function DashboardAdminPackageDetailPage(props: { params: Promise<{ id: string }> }) {\n  const params = await props.params;`,
      },
    ],
  },
  {
    file: 'src/app/dashboard/invoices/[id]/page.tsx',
    replacements: [
      {
        old: `export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {`,
        new: `export default async function InvoiceDetailPage(props: { params: Promise<{ id: string }> }) {\n  const params = await props.params;`,
      },
    ],
  },
  {
    file: 'src/app/dashboard/packages/[id]/page.tsx',
    replacements: [
      {
        old: `export default async function DashboardPackageDetailPage({ params }: { params: { id: string } }) {`,
        new: `export default async function DashboardPackageDetailPage(props: { params: Promise<{ id: string }> }) {\n  const params = await props.params;`,
      },
    ],
  },
  {
    file: 'src/app/track/[trackingNumber]/page.tsx',
    replacements: [
      {
        old: `export default async function TrackResultPage({ params }: { params: { trackingNumber: string } }) {`,
        new: `export default async function TrackResultPage(props: { params: Promise<{ trackingNumber: string }> }) {\n  const params = await props.params;`,
      },
    ],
  },
];

let totalApplied = 0;
let totalSkipped = 0;

for (const { file, replacements } of fixes) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`✗ Could not read ${file}: ${err.message}`);
    continue;
  }

  let changed = false;
  for (const { old, new: replacement } of replacements) {
    if (content.includes(old)) {
      content = content.replace(old, replacement);
      changed = true;
      totalApplied++;
    } else if (content.includes(replacement)) {
      console.log(`- ${file}: already fixed, skipping`);
      totalSkipped++;
    } else {
      console.warn(`! ${file}: expected pattern not found — may need manual review`);
      totalSkipped++;
    }
  }

  if (changed) {
    writeFileSync(file, content, 'utf8');
    console.log(`✓ ${file}: fixed`);
  }
}

console.log(`\nDone. ${totalApplied} replacement(s) applied, ${totalSkipped} skipped.`);
