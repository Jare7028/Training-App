import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authClient } from '@/lib/supabase/server';
import { sameOrigin } from '@/lib/request-origin';
import { createBusiness } from '@/lib/businesses';
export async function POST(request: Request) {
    const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
    try {
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
        const { data: { user } } = await (await authClient()).auth.getUser();
        if (!user?.email_confirmed_at || user.is_anonymous) return json({ error: 'Sign in with a verified email first.' }, 401);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 2000) return json({ error: 'Request is too large.' }, 413);
        let body: unknown;
        try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
        const input = z.object({ businessName: z.string().trim().min(1).max(100), contactName: z.string().trim().min(1).max(100) }).strict().safeParse(body);
        if (!input.success) return json({ error: 'Enter your business and contact name.' }, 400);
        await createBusiness(input.data.businessName, input.data.contactName);
        return json({ ok: true });
    } catch (error) {
        console.error('Business creation failed', error);
        return json({ error: 'Your workspace could not be created. Please retry.' }, 503);
    }
}
