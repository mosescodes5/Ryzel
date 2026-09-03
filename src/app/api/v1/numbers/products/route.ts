import { NextResponse } from 'next/server';
import { getProductCatalog } from '@/modules/numbers/services/activation-service';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.
export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get('country');

  if (!country) {
    return NextResponse.json({ error: 'country is required' }, { status: 400 });
  }

  try {
    const catalog = await getProductCatalog(country);
    return NextResponse.json({ data: catalog });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load catalog';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
