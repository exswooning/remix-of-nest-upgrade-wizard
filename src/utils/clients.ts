import { supabase } from '@/integrations/supabase/client';

export interface Client {
  id: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ClientUpsertInput {
  company_name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  created_by?: string | null;
}

/** Find an existing client by case-insensitive company_name, or create one.
 *  Returns the resulting client row. */
export async function findOrCreateClient(
  input: ClientUpsertInput,
): Promise<{ ok: true; client: Client; created: boolean } | { ok: false; error: string }> {
  const name = input.company_name.trim();
  if (!name) return { ok: false, error: 'company_name is required' };

  // Case-insensitive lookup
  const { data: existing, error: lookupErr } = await supabase
    .from('clients' as any)
    .select('*')
    .ilike('company_name', name)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };

  if (existing) {
    // Opportunistically fill in any newly-provided fields that are still empty
    const ex = existing as Client;
    const patch: Partial<Client> = {};
    if (!ex.contact_person && input.contact_person) patch.contact_person = input.contact_person;
    if (!ex.email && input.email) patch.email = input.email;
    if (!ex.phone && input.phone) patch.phone = input.phone;
    if (!ex.location && input.location) patch.location = input.location;
    if (Object.keys(patch).length > 0) {
      const { data: updated } = await supabase
        .from('clients' as any)
        .update(patch)
        .eq('id', ex.id)
        .select('*')
        .maybeSingle();
      return { ok: true, client: (updated as Client) ?? ex, created: false };
    }
    return { ok: true, client: ex, created: false };
  }

  const { data: created, error: insErr } = await supabase
    .from('clients' as any)
    .insert({
      company_name: name,
      contact_person: input.contact_person ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      location: input.location ?? null,
      created_by: input.created_by ?? null,
    } as any)
    .select('*')
    .maybeSingle();
  if (insErr || !created) return { ok: false, error: insErr?.message ?? 'Insert returned no row' };
  return { ok: true, client: created as Client, created: true };
}

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients' as any)
    .select('*')
    .order('company_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Client[]) ?? [];
}

export interface ClientWithCounts extends Client {
  contracts_count: number;
  rfp_count: number;
}

/** Fetch clients along with counts of their linked contracts and RFPs.
 *  We do this in three queries (clients, contracts, rfp_submissions) and join
 *  client-side — simpler than RPC, fine for the dataset size. */
export async function listClientsWithCounts(): Promise<ClientWithCounts[]> {
  const [clients, contracts, rfps] = await Promise.all([
    supabase.from('clients' as any).select('*'),
    supabase.from('contracts').select('client_id'),
    supabase.from('rfp_submissions').select('client_id'),
  ]);
  if (clients.error) throw new Error(clients.error.message);

  const contractCounts = new Map<string, number>();
  const rfpCounts = new Map<string, number>();
  ((contracts.data ?? []) as any[]).forEach((r) => {
    if (r.client_id) contractCounts.set(r.client_id, (contractCounts.get(r.client_id) ?? 0) + 1);
  });
  ((rfps.data ?? []) as any[]).forEach((r) => {
    if (r.client_id) rfpCounts.set(r.client_id, (rfpCounts.get(r.client_id) ?? 0) + 1);
  });

  return ((clients.data ?? []) as Client[])
    .map(c => ({
      ...c,
      contracts_count: contractCounts.get(c.id) ?? 0,
      rfp_count: rfpCounts.get(c.id) ?? 0,
    }))
    .sort((a, b) => a.company_name.localeCompare(b.company_name));
}
