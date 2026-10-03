import 'server-only';
import { authClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export type RecordRow = Record<string, unknown>;
type Table = 'assessments' | 'attempts' | 'modules' | 'preview_attempts' | 'workspace_members';
const jsonColumns = new Set(['modules', 'content', 'snapshot', 'answers', 'result', 'review', 'config', 'hiring']);

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
export function createStore(client: () => SupabaseClient | Promise<SupabaseClient>) {
    async function allRows(table: Table, filters: RecordRow, options: { order?: string; limit?: number; complete?: boolean } = {}) {
        const db = await client(), rows: RecordRow[] = [];
        let cursor: RecordRow | undefined;
        do {
            let query = db.from(table).select('*');
            for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
            if (options.order) query = query.order(options.order, { ascending: false });
            if (options.complete) {
                if (!options.order) throw new Error('Complete reads require a stable timestamp order.');
                query = query.order('id', { ascending: false }).limit(500);
                if (cursor) {
                    if (!Number.isSafeInteger(cursor[options.order]) || !/^[a-zA-Z0-9-]+$/.test(String(cursor.id))) throw new Error('Invalid pagination cursor.');
                    query = query.or(`${options.order}.lt.${cursor[options.order]},and(${options.order}.eq.${cursor[options.order]},id.lt.${cursor.id})`);
                }
            } else if (options.limit) query = query.limit(options.limit);
            const { data, error } = await query;
            if (error) throw new Error(`Database read failed (${error.code}).`);
            rows.push(...data.map(loaded));
            if (!options.complete || data.length < 500) break;
            cursor = data.at(-1);
        } while (cursor);
        return rows;
    }
    async function firstRow(table: Table, filters: RecordRow) {
        return (await allRows(table, filters, { limit: 1 }))[0] || null;
    }
    async function insertRow(table: Table, row: RecordRow) {
        const { error } = await (await client()).from(table).insert(stored(row));
        if (error) throw new Error(`Database insert failed (${error.code}).`);
    }
    async function updateRows(table: Table, values: RecordRow, filters: RecordRow) {
        let query = (await client()).from(table).update(stored(values));
        for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
        const { data, error } = await query.select('id');
        if (error) throw new Error(`Database update failed (${error.code}).`);
        return data.length;
    }
    async function deleteExpiredPreviews(owner: string, now: number) {
        const { error } = await (await client()).from('preview_attempts').delete().eq('owner', owner).lt('expires_at', now);
        if (error) throw new Error(`Preview cleanup failed (${error.code}).`);
    }
    return { allRows, firstRow, insertRow, updateRows, deleteExpiredPreviews };
}
export const { allRows, firstRow, insertRow, updateRows, deleteExpiredPreviews } = createStore(authClient);

export async function hashToken(token: string) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return Array.from(new Uint8Array(buffer), x => x.toString(16).padStart(2, '0')).join('');
}
