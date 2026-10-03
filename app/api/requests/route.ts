import { z } from 'zod';
import { getAssessmentAdmin } from '@/app/admin-auth';
import { authClient } from '@/lib/supabase/server';
import { sameOrigin } from '@/lib/request-origin';
import { canEdit } from '@/lib/permissions';
import { defaultRequestColumns, requestPriorities } from '@/lib/requests';
import { limitedBody, requestBoard, requestError, RequestFailure, requestJson } from '@/lib/requests-server';

export const dynamic = 'force-dynamic';
const columnId = z.string().regex(/^[a-zA-Z0-9-]{1,50}$/);
const input = z.discriminatedUnion('action', [
    z.object({ action: z.literal('save'), id: z.string().uuid(), revision: z.number().int().nonnegative(), title: z.string().trim().min(1).max(200), description: z.string().max(10000), columnId, assigneeId: z.string().uuid().nullable(), priority: z.enum(requestPriorities) }).strict(),
    z.object({ action: z.literal('move'), id: z.string().uuid(), revision: z.number().int().positive(), columnId, beforeId: z.string().uuid().optional() }).strict(),
    z.object({ action: z.literal('archive'), id: z.string().uuid(), revision: z.number().int().positive() }).strict(),
    z.object({ action: z.literal('columns'), revision: z.number().int().nonnegative(), columns: z.array(z.object({ id: columnId, name: z.string().trim().min(1).max(60) }).strict()).min(1).max(12) }).strict(),
]);
export async function GET(request: Request) {
    try {
        const user = await getAssessmentAdmin(); if (!user) return requestJson({ error: 'Sign in to continue.' }, 401);
        if (request.headers.get('x-assess-tenant') && request.headers.get('x-assess-tenant') !== user.tenantId) return requestJson({ error: 'The selected business changed. Reload before continuing.' }, 409);
        const db = await authClient();
        const [board, members] = await Promise.all([requestBoard(user.tenantId), db.rpc('request_assignees', { business_owner: user.workspaceOwner })]);
        if (members.error) throw new Error('Assignment lookup failed');
        return requestJson({ ...board, users: members.data, userId: user.userId, role: user.role, tenantId: user.tenantId });
    } catch (error) { return requestError(error, 'Requests could not be loaded. Please retry.'); }
}
export async function POST(request: Request) {
    try {
        const user = await getAssessmentAdmin(); if (!user) return requestJson({ error: 'Sign in to continue.' }, 401);
        if (request.headers.get('x-assess-tenant') && request.headers.get('x-assess-tenant') !== user.tenantId) return requestJson({ error: 'The selected business changed. Reload before continuing.' }, 409);
        if (!canEdit(user.role)) return requestJson({ error: 'Viewer access does not allow changes.' }, 403);
        if (!sameOrigin(request)) return requestJson({ error: 'Invalid request origin.' }, 403);
        let raw: unknown;
        try { raw = JSON.parse(new TextDecoder().decode(await limitedBody(request, 48000))); }
        catch (error) { if (error instanceof RequestFailure) throw error; throw new RequestFailure('Invalid request.'); }
        const result = input.safeParse(raw); if (!result.success) throw new RequestFailure('Enter a title and valid request details.');
        const body = result.data, db = await authClient();
        // Create only board configuration on first use, never sample requests.
        const initial = await db.from('request_boards').upsert({ tenant_id: user.tenantId, owner: user.workspaceOwner, columns: defaultRequestColumns }, { onConflict: 'tenant_id', ignoreDuplicates: true });
        if (initial.error) throw new Error('Unable to prepare board');
        const board = await requestBoard(user.tenantId);
        if (body.action === 'columns') {
            if (new Set(body.columns.map(c => c.id)).size !== body.columns.length) throw new RequestFailure('Each column needs its own identifier.');
            if (board.requests.some(card => !body.columns.some(c => c.id === card.columnId))) throw new RequestFailure('Move the requests before removing their column.');
            // The first board is created by this request at revision one.
            const expected = body.revision === 0 ? 1 : body.revision;
            const { data, error } = await db.from('request_boards').update({ columns: body.columns, revision: expected + 1 }).eq('tenant_id', user.tenantId).eq('revision', expected).select('tenant_id');
            if (error) throw new RequestFailure('Columns could not be saved. Move any remaining requests and retry.');
            if (!data.length) throw new RequestFailure('The columns changed in another tab. Refresh before saving.', 409);
        } else {
            const card = board.requests.find(c => c.id === body.id);
            if (body.action !== 'save' || body.revision > 0) {
                if (!card) throw new RequestFailure('Request not found.', 404);
                if (card.revision !== body.revision) throw new RequestFailure('This request changed in another tab. Refresh before saving.', 409);
            } else if (card) {
                // The caller-generated ID makes a lost create response safe to retry.
                const same = card.title === body.title && card.description === body.description && card.columnId === body.columnId && card.assigneeId === body.assigneeId && card.priority === body.priority;
                if (!same) throw new RequestFailure('This request already exists. Refresh before editing it.', 409);
                return requestJson({ id: card.id, ...board });
            }
            if ('columnId' in body && !board.columns.some((c: { id: string }) => c.id === body.columnId)) throw new RequestFailure('Choose an existing column.');
            const now = Date.now();
            if (body.action === 'save') {
                if (body.assigneeId && body.assigneeId !== card?.assigneeId) {
                    const members = await db.rpc('request_assignees', { business_owner: user.workspaceOwner });
                    if (members.error) throw new Error('Assignment lookup failed');
                    if (!members.data.some((member: { id: string; status: string }) => member.id === body.assigneeId && member.status === 'active')) throw new RequestFailure('Choose an active user in this business.');
                }
                const fields = { title: body.title, description: body.description, column_id: body.columnId, assignee_id: body.assigneeId, priority: body.priority, updated_at: now, revision: body.revision + 1, position: card?.columnId === body.columnId ? card.position : now };
                const query = card ? db.from('workspace_requests').update(fields).eq('id', body.id).eq('tenant_id', user.tenantId).eq('revision', body.revision) : db.from('workspace_requests').insert({ ...fields, id: body.id, owner: user.workspaceOwner, tenant_id: user.tenantId, created_at: now });
                const { data, error } = await query.select('id');
                if (error) throw new RequestFailure('The request could not be saved. Check its column and assignee, then retry.');
                if (!data.length) throw new RequestFailure('This request changed in another tab. Refresh before saving.', 409);
            } else {
                const fields = body.action === 'archive' ? { archived: true, updated_at: now, revision: body.revision + 1 } : (() => {
                    const siblings = board.requests.filter(c => c.columnId === body.columnId && c.id !== body.id);
                    const index = body.beforeId ? siblings.findIndex(c => c.id === body.beforeId) : siblings.length;
                    if (index < 0) throw new RequestFailure('The target request changed. Refresh before moving.');
                    const next = siblings[index]?.position, previous = siblings[index - 1]?.position;
                    return { column_id: body.columnId, position: next === undefined ? (previous || 0) + 1024 : previous === undefined ? next - 1024 : (previous + next) / 2, updated_at: now, revision: body.revision + 1 };
                })();
                const { data, error } = await db.from('workspace_requests').update(fields).eq('tenant_id', user.tenantId).eq('id', body.id).eq('revision', body.revision).select('id');
                if (error) throw new RequestFailure('The request could not be moved. Refresh and retry.');
                if (!data.length) throw new RequestFailure('This request changed in another tab. Refresh before saving.', 409);
            }
        }
        return requestJson({ id: 'id' in body ? body.id : undefined, ...await requestBoard(user.tenantId) });
    } catch (error) { return requestError(error); }
}
