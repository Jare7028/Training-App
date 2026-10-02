import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/request-origin';
import { authClient, authConfigured } from '@/lib/supabase/server';
export async function POST(request: Request) {
    const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
    if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
    if (!authConfigured()) return json({ error: 'Admin sign-in is not configured yet.' }, 503);
    if (Number(request.headers.get('content-length')) > 4000) return json({ error: 'Request is too large.' }, 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 4000) return json({ error: 'Request is too large.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 254 || body.password.length > 256) return json({ error: 'Enter your email address and password.' }, 400);
    const { error } = await (await authClient()).auth.signInWithPassword({ email: body.email.trim(), password: body.password });
    if (error) return json({ error: 'Unable to sign in with these details. Check your email and password.' }, 401);
    return json({ ok: true });
}
