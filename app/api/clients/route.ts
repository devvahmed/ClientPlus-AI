import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    
    // Fetch all saved clients sorted by newest first
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ clients: data || [] });
  } catch (err) {
    console.error('Fetch clients error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}
