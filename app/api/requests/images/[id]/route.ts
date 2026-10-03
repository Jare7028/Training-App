import { z } from 'zod';
import { getAssessmentAdmin } from '@/app/admin-auth';
import { authClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/admin';
import { sameOrigin } from '@/lib/request-origin';
import { canEdit } from '@/lib/permissions';
import { requestImageBucket } from '@/lib/requests';
import { requestError, RequestFailure, requestJson } from '@/lib/requests-server';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
async function imageForUser(id: string, tenantId: string) {
    if (!z.string().uuid().safeParse(id).success) throw new RequestFailure('Image not found.', 404);
    const db = await authClient();
    const image = await db.from('request_images').select('id,request_id,object_path,name').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (image.error) throw new Error('Image lookup failed');
    if (!image.data) throw new RequestFailure('Image not found.', 404);
    const card = await db.from('workspace_requests').select('id').eq('tenant_id', tenantId).eq('id', image.data.request_id).eq('archived', false).maybeSingle();
    if (card.error) throw new Error('Request lookup failed');
    if (!card.data) throw new RequestFailure('Image not found.', 404);
    return image.data;
}
export async function GET(_request: Request, context: Context) {
    try {
        const user = await getAssessmentAdmin(); if (!user) return requestJson({ error: 'Sign in to continue.' }, 401);
        const image = await imageForUser((await context.params).id, user.tenantId);
        const download = await serviceClient().storage.from(requestImageBucket).download(image.object_path);
        if (download.error || !download.data) throw new Error('Image download failed');
        return new Response(download.data, { headers: { 'Content-Type': 'image/webp', 'Content-Length': String(download.data.size), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(image.name), 'Referrer-Policy': 'no-referrer' } });
    } catch (error) { return requestError(error); }
}
export async function DELETE(request: Request, context: Context) {
    try {
        const user = await getAssessmentAdmin(); if (!user) return requestJson({ error: 'Sign in to continue.' }, 401);
        if (!canEdit(user.role)) return requestJson({ error: 'Viewer access does not allow changes.' }, 403);
        if (!sameOrigin(request)) return requestJson({ error: 'Invalid request origin.' }, 403);
        const image = await imageForUser((await context.params).id, user.tenantId), db = await authClient();
        const removed = await serviceClient().storage.from(requestImageBucket).remove([image.object_path]);
        if (removed.error) throw new Error('Private image removal failed');
        const deleted = await db.from('request_images').delete().eq('id', image.id).eq('tenant_id', user.tenantId);
        if (deleted.error) throw new Error('Image metadata removal failed');
        return requestJson({ ok: true });
    } catch (error) { return requestError(error); }
}
