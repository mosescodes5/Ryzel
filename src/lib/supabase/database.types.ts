// Placeholder types. Once the Supabase project exists, regenerate with:
//   npm run db:types
// This keeps the app type-safe without blocking local development on a live project.
//
// Every table needs a `Relationships` array (even if empty) and the schema
// needs `Views`/`Functions` keys — @supabase/postgrest-js's `GenericSchema`
// requires all three or it silently falls back to typing every query
// result as `never` instead of erroring loudly. `supabase gen types` always
// includes these; this hand-written placeholder needs them added manually.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          role: 'user' | 'admin';
          wallet_balance_cents: number;
          notify_phone_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string; email: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      services: {
        Row: {
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
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['services']['Row']>;
        Update: Partial<Database['public']['Tables']['services']['Row']>;
        Relationships: [];
      };
      feature_flags: {
        Row: {
          id: string;
          key: string;
          enabled: boolean;
          config: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['feature_flags']['Row']>;
        Update: Partial<Database['public']['Tables']['feature_flags']['Row']>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: 'credit' | 'debit';
          amount_cents: number;
          currency: string;
          reason: string;
          reference_type: string | null;
          reference_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['transactions']['Row']> & {
          user_id: string;
          type: 'credit' | 'debit';
          amount_cents: number;
          reason: string;
        };
        Update: Partial<Database['public']['Tables']['transactions']['Row']>;
        Relationships: [];
      };
      number_inventory: {
        Row: {
          id: string;
          provider: string;
          provider_number_id: string | null;
          phone_number: string;
          country_code: string;
          area_code: string | null;
          monthly_price_cents: number;
          status: 'available' | 'reserved' | 'sold' | 'disabled';
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['number_inventory']['Row']>;
        Update: Partial<Database['public']['Tables']['number_inventory']['Row']>;
        Relationships: [];
      };
      number_orders: {
        Row: {
          id: string;
          user_id: string;
          number_id: string | null;
          provider: string;
          provider_order_id: string | null;
          phone_number: string | null;
          country: string | null;
          operator: string | null;
          product: string | null;
          status: 'awaiting_sms' | 'received' | 'active' | 'finished' | 'cancelled' | 'expired' | 'failed';
          price_cents: number;
          cost_cents: number;
          renews_at: string | null;
          expires_at: string | null;
          last_checked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['number_orders']['Row']> & {
          user_id: string;
          price_cents: number;
        };
        Update: Partial<Database['public']['Tables']['number_orders']['Row']>;
        Relationships: [];
      };
      number_pricing: {
        Row: {
          id: boolean;
          markup_type: 'percent' | 'flat';
          markup_percent: number;
          markup_flat_cents: number;
          min_price_cents: number;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['number_pricing']['Row']>;
        Update: Partial<Database['public']['Tables']['number_pricing']['Row']>;
        Relationships: [];
      };
      service_pricing: {
        Row: {
          product: string;
          markup_type: 'percent' | 'flat';
          markup_percent: number;
          markup_flat_cents: number;
          min_price_cents: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['service_pricing']['Row']> & { product: string };
        Update: Partial<Database['public']['Tables']['service_pricing']['Row']>;
        Relationships: [];
      };
      site_settings: {
        Row: {
          id: boolean;
          whatsapp_group_link: string | null;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['site_settings']['Row']>;
        Update: Partial<Database['public']['Tables']['site_settings']['Row']>;
        Relationships: [];
      };
      sms_messages: {
        Row: {
          id: string;
          number_order_id: string;
          from_number: string | null;
          body: string | null;
          received_at: string;
        };
        Insert: Partial<Database['public']['Tables']['sms_messages']['Row']> & { number_order_id: string };
        Update: Partial<Database['public']['Tables']['sms_messages']['Row']>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          provider_reference: string | null;
          amount_cents: number;
          currency: string;
          status: 'pending' | 'succeeded' | 'failed' | 'refunded';
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['payments']['Row']> & { user_id: string; amount_cents: number };
        Update: Partial<Database['public']['Tables']['payments']['Row']>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['audit_logs']['Row']> & { action: string };
        Update: Partial<Database['public']['Tables']['audit_logs']['Row']>;
        Relationships: [];
      };
      packages: {
        Row: {
          id: string;
          tracking_number: string;
          customer_name: string | null;
          customer_email: string | null;
          customer_phone: string | null;
          description: string | null;
          origin: string | null;
          destination: string | null;
          status:
            | 'pending'
            | 'received'
            | 'in_transit'
            | 'out_for_delivery'
            | 'delivered'
            | 'delayed'
            | 'exception'
            | 'cancelled';
          estimated_delivery: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['packages']['Row']> & { tracking_number: string };
        Update: Partial<Database['public']['Tables']['packages']['Row']>;
        Relationships: [];
      };
      package_events: {
        Row: {
          id: string;
          package_id: string;
          status: string;
          note: string | null;
          location: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['package_events']['Row']> & {
          package_id: string;
          status: string;
        };
        Update: Partial<Database['public']['Tables']['package_events']['Row']>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          user_id: string;
          invoice_number: string;
          customer_name: string;
          customer_email: string | null;
          business_name: string | null;
          items: { description: string; quantity: number; unit_price_cents: number }[];
          currency: string;
          notes: string | null;
          due_date: string | null;
          status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
          subtotal_cents: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['invoices']['Row']> & {
          user_id: string;
          invoice_number: string;
          customer_name: string;
        };
        Update: Partial<Database['public']['Tables']['invoices']['Row']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      increment_rate_limit: {
        Args: { p_key: string; p_window_start: string };
        Returns: number;
      };
    };
  };
};
