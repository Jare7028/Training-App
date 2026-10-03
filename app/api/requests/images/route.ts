import sharp from 'sharp';
import { z } from 'zod';
import { getAssessmentAdmin } from '@/app/admin-auth';
import { authClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/admin';
import { sameOrigin } from '@/lib/request-origin';
import { canEdit } from '@/lib/permissions';
import { maxRequestImageBytes, requestImageBucket } from '@/lib/requests';
import { limitedBody, requestError, RequestFailure, requestJson } from '@/lib/requests-server';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
    try {
        const user = await getAssessmentAdmin(); if (!user) return requestJson({ error: 'Sign in to continue.' }, 401);
        if (request.headers.get('x-assess-tenant') && request.headers.get('x-assess-tenant') !== user.tenantId) return requestJson({ error: 'The selected business changed. Reload before continuing.' }, 409);
        if (!canEdit(user.role)) return requestJson({ error: 'Viewer access does not allow uploads.' }, 403);
        if (!sameOrigin(request)) return requestJson({ error: 'Invalid request origin.' }, 403);
        const type = request.headers.get('content-type') || '';
        if (!type.startsWith('multipart/form-data')) throw new RequestFailure('Choose an image.');
        const bytes = await limitedBody(request, maxRequestImageBytes + 16384);
        const form = await new Response(bytes, { headers: { 'Content-Type': type } }).formData();
        const ids = z.object({ id: z.string().uuid(), requestId: z.string().uuid() }).safeParse({ id: form.get('id'), requestId: form.get('requestId') });
        const file = form.get('file');
        if (!ids.success || !(file instanceof File)) throw new RequestFailure('Choose an image and request.');
        if (!file.size || file.size > maxRequestImageBytes) throw new RequestFailure('Use an image smaller than 3 MB.', 413);
        const { id, requestId } = ids.data, db = await authClient();
        const card = await db.from('workspace_requests').select('id').eq('id', requestId).eq('tenant_id', user.tenantId).eq('archived', false).maybeSingle();
        if (card.error) throw new Error('Request lookup failed');
        if (!card.data) throw new RequestFailure('Request not found.', 404);
        const existing = await db.from('request_images').select('id,request_id').eq('id', id).eq('tenant_id', user.tenantId).maybeSingle();
        if (existing.error) throw new Error('Image lookup failed');
        if (existing.data) {
            if (existing.data.request_id !== requestId) throw new RequestFailure('This image belongs to another request.', 409);
            return requestJson({ id });
        }
        let image: Buffer;
        try {
            const decoder = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 25000000, failOn: 'error' });
            const metadata = await decoder.metadata();
            if (!['png', 'jpeg', 'webp', 'gif'].includes(metadata.format || '')) throw new Error('Unsupported image');
            image = await decoder.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
        } catch { throw new RequestFailure('Use a valid PNG, JPEG, WebP or GIF image.'); }
        if (image.length > maxRequestImageBytes) throw new RequestFailure('The image is too large. Try a smaller screenshot.', 413);
        const path = user.tenantId + '/' + requestId + '/' + id + '.webp';
        const storage = serviceClient().storage.from(requestImageBucket);
        const uploaded = await storage.upload(path, image, { contentType: 'image/webp', upsert: false });
        if (uploaded.error) throw new Error('Private image upload failed');
        const name = (file.name.replace(/[\x00-\x1f/\\]/g, '').replace(/\.[^.]+$/, '').slice(0, 140) || 'Screenshot') + '.webp';
        const inserted = await db.from('request_images').insert({ id, tenant_id: user.tenantId, owner: user.workspaceOwner, request_id: requestId, object_path: path, name, bytes: image.length, created_at: Date.now() });
        if (inserted.error) { await storage.remove([path]); throw new Error('Image metadata could not be saved'); }
        return requestJson({ id });
    } catch (error) { return requestError(error); }
}
