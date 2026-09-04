import { NextResponse } from 'next/server';
import { pollAllPendingOrders } from '@/modules/numbers/services/activation-service';

// Runs on Cloudflare's Workers runtime via @cloudflare/next-on-pages.

/**
 * Meant to be called on a schedule (Vercel Cron, or any external
 * scheduler like cron-job.org / GitHub Actions) rather than by a user.
 * Protected by a shared secret since it has no user session:
 *   - Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically
 *     when CRON_SECRET is set as an env var and referenced in vercel.json.
 *   - An external scheduler should send the same header manually.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await pollAllPendingOrders();
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Poll failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
