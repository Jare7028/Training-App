import { getAssessmentAdmin } from '@/app/admin-auth';
import { authClient } from '@/lib/supabase/server';
import { defaultRequestColumns } from '@/lib/requests';
import { analyticsPeriod, assessmentAnalytics, requestAnalytics, type AnalyticsAttempt, type AnalyticsRequest } from '@/lib/analytics';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
// Read every page, rather than the candidate screen's most recent 200 records
// or PostgREST's default row limit. Stable ID ordering prevents page overlap.
async function pages(db: SupabaseClient, table: string, fields: string, tenantId: string, from?: number, until?: number, assessmentId?: string) {
    const rows: Record<string, unknown>[] = []; let after = '';
    while (true) {
        let query = db.from(table).select(fields).eq('tenant_id', tenantId).order('id').limit(500);
        if (table === 'attempts') query = query.eq('demo', 0);
        if (from !== undefined) query = query.gte('created_at', from);
        if (until !== undefined) query = query.lt('created_at', until);
        if (assessmentId) query = query.eq('assessment_id', assessmentId);
        if (after) query = query.gt('id', after);
        const result = await query;
        if (result.error) throw new Error('Analytics query failed');
        const data = result.data as unknown as Record<string, unknown>[];
        rows.push(...data); if (data.length < 500) break;
        after = String(data[data.length - 1].id);
    }
    return rows;
}
export async function GET(request: Request) {
    try {
        const user = await getAssessmentAdmin(); if (!user) return json({ error: 'Sign in to view analytics.' }, 401);
        if (request.headers.get('x-tenant-id') && request.headers.get('x-tenant-id') !== user.tenantId) return json({ error: 'The selected business changed. Reload before continuing.' }, 409);
        const params = new URL(request.url).searchParams, now = Date.now(), view = params.get('view') || 'assessments';
        if (!['assessments', 'requests'].includes(view)) return json({ error: 'Choose a valid analytics view.' }, 400);
        let range; try { range = analyticsPeriod(params, now); } catch (error) { return json({ error: (error as Error).message }, 400); }
        const db = await authClient();
        if (view === 'requests') {
            const [rows, board, directory] = await Promise.all([
                pages(db, 'workspace_requests', 'id,column_id,assignee_id,priority,archived,created_at', user.tenantId, range.from, Math.min(range.until, now + 1)),
                db.from('request_boards').select('columns').eq('tenant_id', user.tenantId).maybeSingle(),
                db.rpc('request_assignees', { business_owner: user.workspaceOwner }),
            ]);
            if (board.error || directory.error) throw new Error('Board summary failed');
            return json({ tenantId: user.tenantId, generatedAt: now, range, assessmentOptions: [], requests: requestAnalytics(rows as AnalyticsRequest[], board.data?.columns || defaultRequestColumns, directory.data, range, now) });
        }
        const id = params.get('assessment');
        const tests = await pages(db, 'assessments', 'id,title', user.tenantId);
        const options = (tests as { id: string; title: string }[]).sort((a, b) => a.title.localeCompare(b.title));
        if (id && id !== 'all' && !options.some(t => t.id === id)) return json({ error: 'Assessment not found in this business.' }, 404);
        // Only measured data and assigned content needed for grouping are read.
        // Token hashes, candidate aliases, responses and image paths are omitted.
        const rows = await pages(db, 'attempts', 'id,assessment_id,status,created_at,started_at,deadline,expires_at,revoked,snapshot,result,review', user.tenantId, range.from, Math.min(range.until, now + 1), id && id !== 'all' ? id : undefined);
        return json({ tenantId: user.tenantId, generatedAt: now, range, assessmentOptions: options, assessments: assessmentAnalytics(rows as AnalyticsAttempt[], options, range, now) });
    } catch { console.error('Analytics load failed'); return json({ error: 'Analytics could not be loaded. Please retry.' }, 503); }
}
