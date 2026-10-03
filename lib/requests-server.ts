import 'server-only';
import { authClient } from '@/lib/supabase/server';
import { defaultRequestColumns, type WorkspaceRequest, type RequestImage } from './requests';

export class RequestFailure extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
export const requestJson = (data: unknown, status = 200) => Response.json(data, {
    status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
});
export async function limitedBody(request: Request, limit: number) {
    if (Number(request.headers.get('content-length')) > limit) throw new RequestFailure('Request is too large.', 413);
    const reader = request.body?.getReader();
    if (!reader) return new Uint8Array();
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > limit) { await reader.cancel(); throw new RequestFailure('Request is too large.', 413); }
        chunks.push(value);
    }
    return Buffer.concat(chunks);
}
export function requestError(error: unknown, message = 'The request could not be saved. Please retry.') {
    if (error instanceof RequestFailure) return requestJson({ error: error.message }, error.status);
    console.error('Requests operation failed');
    return requestJson({ error: message }, 503);
}
export async function requestBoard(tenantId: string) {
    const db = await authClient();
    const [board, cards, images] = await Promise.all([
        db.from('request_boards').select('columns,revision').eq('tenant_id', tenantId).maybeSingle(),
        db.from('workspace_requests').select('*').eq('tenant_id', tenantId).eq('archived', false).order('position').order('id'),
        db.from('request_images').select('id,request_id,name,bytes').eq('tenant_id', tenantId).order('created_at'),
    ]);
    if (board.error || cards.error || images.error) throw new Error('Board lookup failed');
    const pictures: RequestImage[] = images.data.map(image => ({ id: image.id, requestId: image.request_id, name: image.name, bytes: image.bytes, url: '/api/requests/images/' + image.id }));
    const requests: WorkspaceRequest[] = cards.data.map(row => ({ id: row.id, title: row.title, description: row.description,
        columnId: row.column_id, assigneeId: row.assignee_id, priority: row.priority, position: row.position,
        revision: row.revision, updatedAt: row.updated_at, images: pictures.filter(image => image.requestId === row.id),
    }));
    return { columns: board.data?.columns || defaultRequestColumns, revision: board.data?.revision || 0, requests };
}
