import { NextResponse } from 'next/server';
import { getOfferCatalog } from '@/modules/numbers/services/activation-service';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.
export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get('country');
  const product = searchParams.get('product');

  if (!country || !product) {
    return NextResponse.json({ error: 'country and product are required' }, { status: 400 });
  }

  try {
    const offers = await getOfferCatalog(country, product);
    return NextResponse.json({ data: offers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load offers';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
