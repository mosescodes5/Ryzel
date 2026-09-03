import { createClient } from '@/lib/supabase/server';

export type ServiceRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  icon: string | null;
  type: 'marketplace' | 'tool';
  active: boolean;
  requires_auth: boolean;
  pricing_type: 'free' | 'one_time' | 'usage' | 'subscription' | 'credits';
};

/**
 * Central catalog of every product on the platform (live or "coming soon").
 * New modules register a row in `services` (see supabase/schema.sql) and
 * appear automatically in the marketplace/tools UI and the admin panel —
 * no core app changes needed to launch or retire a product.
 */
export async function listServices(opts?: { activeOnly?: boolean }): Promise<ServiceRecord[]> {
  const supabase = createClient();
  let query = supabase.from('services').select('*').order('category');

  if (opts?.activeOnly) {
    query = query.eq('active', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getServiceBySlug(slug: string): Promise<ServiceRecord | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from('services').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data;
}
