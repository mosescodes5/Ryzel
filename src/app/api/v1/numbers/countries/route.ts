import { NextResponse } from 'next/server';
import { getCountryCatalog } from '@/modules/numbers/services/activation-service';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.

export async function GET() {
  try {
    const countries = await getCountryCatalog();
    return NextResponse.json({ data: countries });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load countries';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
