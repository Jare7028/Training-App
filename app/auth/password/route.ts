import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/request-origin';
import { authClient, authConfigured } from '@/lib/supabase/server';

export async function POST(request: Request) {
    const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
    if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
    if (!authConfigured()) return json({ error: 'Account setup is not configured yet.' }, 503);
    if (Number(request.headers.get('content-length')) > 4000) return json({ error: 'Request is too large.' }, 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 4000) return json({ error: 'Request is too large.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
    if (!body || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 256)
        return json({ error: 'Use a password between 12 and 256 characters.' }, 400);
    const client = await authClient();
    const { data: { user }, error: sessionError } = await client.auth.getUser();
    if (sessionError || !user || user.is_anonymous)
        return json({ error: 'This link may have expired. Request a new password reset email.' }, 401);
    const { error } = await client.auth.updateUser({ password: body.password });
    if (error) return json({ error: error.code === 'weak_password' ? 'Choose a stronger password and try again.' : error.code === 'same_password' ? 'Choose a different password from your current one.' : 'The password could not be updated. Request a fresh link and try again.' }, 400);
    return json({ ok: true });
}
