#!/usr/bin/env node
// fix-async-supabase.mjs
// Adds `await` to every `createClient()` call from src/lib/supabase/server.ts,
// now that createClient() is itself async. Run from the project root:
//   node fix-async-supabase.mjs

import { readFileSync, writeFileSync } from 'fs';

const standardFiles = [
  'src/app/api/v1/numbers/orders/[id]/cancel/route.ts',
  'src/app/api/v1/numbers/orders/[id]/check/route.ts',
  'src/app/api/v1/numbers/purchase/route.ts',
  'src/app/api/v1/numbers/[id]/purchase/route.ts',
  'src/app/api/v1/orders/route.ts',
  'src/app/api/v1/sms/route.ts',
  'src/app/api/v1/wallet/route.ts',
  'src/app/api/v1/wallet/topup/route.ts',
  'src/app/api/v1/wallet/verify/route.ts',
  'src/app/auth/callback/route.ts',
  'src/app/dashboard/account/actions.ts',
  'src/app/dashboard/account/page.tsx',
  'src/app/dashboard/layout.tsx',
  'src/app/dashboard/page.tsx',
  'src/app/dashboard/transactions/page.tsx',
  'src/lib/feature-flags/feature-flags.ts',
  'src/lib/invoices/invoice-service.ts',
  'src/lib/packages/package-service.ts',
  'src/lib/permissions/permissions.ts',
  'src/lib/services/service-registry.ts',
  'src/modules/numbers/services/activation-service.ts',
  'src/modules/numbers/services/number-service.ts',
  'src/modules/sms/services/sms-service.ts',
];

const OLD = 'const supabase = createClient();';
const NEW = 'const supabase = await createClient();';

let totalReplacements = 0;

for (const file of standardFiles) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`✗ Could not read ${file}: ${err.message}`);
    continue;
  }

  const occurrences = content.split(OLD).length - 1;
  if (occurrences === 0) {
    if (content.includes(NEW)) {
      console.log(`- ${file}: already fixed, skipping`);
    } else {
      console.warn(`! ${file}: expected pattern not found — needs manual review`);
    }
    continue;
  }

  content = content.split(OLD).join(NEW);
  writeFileSync(file, content, 'utf8');
  console.log(`✓ ${file}: ${occurrences} replacement(s)`);
  totalReplacements += occurrences;
}

// Special case: inline call, not assigned to a variable first.
const specialFile = 'src/lib/pricing/number-pricing.ts';
const specialOld = 'return fetchPricing(createClient(), product);';
const specialNew = 'return fetchPricing(await createClient(), product);';
try {
  let content = readFileSync(specialFile, 'utf8');
  if (content.includes(specialOld)) {
    content = content.replace(specialOld, specialNew);
    writeFileSync(specialFile, content, 'utf8');
    console.log(`✓ ${specialFile}: 1 replacement (inline call)`);
    totalReplacements += 1;
  } else if (content.includes(specialNew)) {
    console.log(`- ${specialFile}: already fixed, skipping`);
  } else {
    console.warn(`! ${specialFile}: expected pattern not found — needs manual review`);
  }
} catch (err) {
  console.error(`✗ Could not read ${specialFile}: ${err.message}`);
}

console.log(`\nDone. ${totalReplacements} total replacement(s) applied.`);
