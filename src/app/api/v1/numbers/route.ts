import { NextResponse } from 'next/server';
import { listInventoryFromDb } from '@/modules/numbers/services/number-service';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.
export const runtime = 'edge';

export async function GET() {
  try {
    const inventory = await listInventoryFromDb();
    return NextResponse.json({ data: inventory });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load inventory' }, { status: 500 });
  }
}
