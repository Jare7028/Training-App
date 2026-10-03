import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { getAssessmentAdmin, tenantCookie } from '@/app/admin-auth';
import { authClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/admin';
import { sameOrigin } from '@/lib/request-origin';

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
    try {
        const user = await getAssessmentAdmin();
        if (!user) return json({ error: 'Sign in to continue.' }, 401);
        if (!user.isGlobalAdmin) return json({ error: 'Only global admins can switch businesses.' }, 403);
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 1000) return json({ error: 'Request is too large.' }, 413);
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
        const input = z.object({ tenantId: z.string().uuid() }).strict().safeParse(parsed);
        if (!input.success) return json({ error: 'Choose a business.' }, 400);
        const { data, error } = await (await authClient()).from('tenants').select('id').eq('id', input.data.tenantId).maybeSingle();
        if (error) throw error;
        if (!data) return json({ error: 'Business not found.' }, 404);
        const { error: auditError } = await serviceClient().from('tenant_admin_audit').insert({ user_id: user.userId, tenant_id: data.id, action: 'switch-tenant' });
        if (auditError) throw auditError;
        (await cookies()).set(tenantCookie, data.id, { httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 86400 });
        return json({ ok: true });
    } catch (error) {
        console.error('Business switch failed', error);
        return json({ error: 'The business could not be opened. Please retry.' }, 503);
    }
}
