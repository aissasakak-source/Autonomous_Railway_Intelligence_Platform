import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey);

export async function logDispatchEvent(
  kind: string,
  severity: 'info' | 'warning' | 'critical',
  message: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('dispatch_events').insert({ kind, severity, message, detail: detail ?? null });
  if (error) console.error('dispatch event insert failed:', error.message);
}

export async function fetchDispatchEvents(limit = 40): Promise<{ id: string; kind: string; severity: string; message: string; created_at: string }[]> {
  const { data, error } = await supabase
    .from('dispatch_events')
    .select('id, kind, severity, message, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('dispatch event fetch failed:', error.message);
    return [];
  }
  return data ?? [];
}
