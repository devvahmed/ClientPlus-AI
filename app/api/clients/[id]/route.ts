import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Client id is required' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ client: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch client' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: 'Client id is required' }, { status: 400 });

    const body = await req.json();
    const supabase = getSupabase();

    // Build update using only known existing columns — no schema changes needed.
    // Stage 2 full JSON is stored in contact_source_context (existing text column).
    const update: Record<string, string | null> = {};
    if (body.status !== undefined)               update.status = body.status ?? null;
    if (body.email !== undefined)                update.email = body.email ?? null;
    if (body.phone !== undefined)                update.phone = body.phone ?? null;
    if (body.phones !== undefined)               update.phones = body.phones ?? null;
    if (body.linkedin_company !== undefined)     update.linkedin_company = body.linkedin_company ?? null;
    if (body.contact_source_url !== undefined)   update.contact_source_url = body.contact_source_url ?? null;
    if (body.contact_source_page !== undefined)  update.contact_source_page = body.contact_source_page ?? null;
    if (body.contact_source_label !== undefined) update.contact_source_label = body.contact_source_label ?? null;
    // Store full Stage 2 JSON in contact_source_context
    if (body.enrichment_json !== undefined)      update.contact_source_context = body.enrichment_json ?? null;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: true, warning: 'Nothing to update' });
    }

    const { data, error } = await supabase
      .from('clients')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // Graceful fallback if some column is missing
      if (error.message?.includes('column')) {
        console.warn('[PATCH client] Column missing, minimal fallback:', error.message);
        const minimal: Record<string, string | null> = {};
        if (body.email !== undefined) minimal.email = body.email ?? null;
        if (body.phone !== undefined) minimal.phone = body.phone ?? null;
        const { data: fb } = await supabase.from('clients').update(minimal).eq('id', id).select().single();
        return NextResponse.json({ success: true, client: fb });
      }
      console.error('[PATCH client] Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, client: data });
  } catch (err) {
    console.error('[PATCH client] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update client' },
      { status: 500 }
    );
  }
}
