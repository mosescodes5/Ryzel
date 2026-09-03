import { createClient } from '@/lib/supabase/server';

/**
 * Checks whether a feature flag is enabled. Lets new modules ship dark
 * (code merged, UI hidden) until they're ready for public traffic.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('feature_flags')
    .select('enabled')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return false;
  return data.enabled;
}

export async function getAllFlags(): Promise<Record<string, boolean>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('feature_flags').select('key, enabled');
  if (error || !data) return {};
  return Object.fromEntries(data.map((f) => [f.key, f.enabled]));
}
