import 'server-only';
import { createClient } from '@supabase/supabase-js';

export type RecordRow = Record<string, unknown>;
type Table = 'assessments' | 'attempts' | 'modules' | 'preview_attempts';
const jsonColumns = new Set(['modules', 'content', 'snapshot', 'answers', 'result', 'review', 'config']);

// Normalize serialized assessment snapshots at this boundary; PostgreSQL stores
// actual JSONB. Issued attempts continue using their immutable content copy.
function stored(row: RecordRow) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
        jsonColumns.has(key) && typeof value === 'string' ? JSON.parse(value) : value]));
}
function loaded(row: RecordRow): RecordRow {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
        jsonColumns.has(key) && value !== null ? JSON.stringify(value) : value]));
}
function client() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase server configuration is missing.');
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function allRows(table: Table, filters: RecordRow, options: { order?: string; limit?: number } = {}) {
    let query = client().from(table).select('*');
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    if (options.order) query = query.order(options.order, { ascending: false });
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw new Error(`Database read failed (${error.code}).`);
    return data.map(loaded);
}
export async function firstRow(table: Table, filters: RecordRow) {
    return (await allRows(table, filters, { limit: 1 }))[0] || null;
}
export async function insertRow(table: Table, row: RecordRow) {
    const { error } = await client().from(table).insert(stored(row));
    if (error) throw new Error(`Database insert failed (${error.code}).`);
}
export async function updateRows(table: Table, values: RecordRow, filters: RecordRow) {
    let query = client().from(table).update(stored(values));
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const { data, error } = await query.select('id');
    if (error) throw new Error(`Database update failed (${error.code}).`);
    return data.length;
}
export async function deleteExpiredPreviews(owner: string, now: number) {
    const { error } = await client().from('preview_attempts').delete().eq('owner', owner).lt('expires_at', now);
    if (error) throw new Error(`Preview cleanup failed (${error.code}).`);
}
export async function hashToken(token: string) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return Array.from(new Uint8Array(buffer), x => x.toString(16).padStart(2, '0')).join('');
}
