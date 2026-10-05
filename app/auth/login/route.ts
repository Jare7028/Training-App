import { firstRow } from '@/db/privileged-store';
import { normalizeUsername, usernamePattern } from '@/lib/usernames';
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
    if (!body || typeof (body.identifier ?? body.email) !== 'string' || typeof body.password !== 'string' || (body.identifier ?? body.email).length > 254 || body.password.length > 256) return json({ error: 'Enter your username or email and password.' }, 400);
    const identifier = normalizeUsername(body.identifier ?? body.email);
    let email = identifier;
    if (!identifier.includes('@')) {
        if (!usernamePattern.test(identifier)) return json({error:'Unable to sign in with these details. Check your username or email and password.'},401);
        try {
            const member = await firstRow('workspace_members',{username:identifier});
            if (!member || member.status !== 'active') return json({error:'Unable to sign in with these details. Check your username or email and password.'},401);
            email = String(member.email);
        } catch { return json({error:'Sign-in is temporarily unavailable. Please retry.'},503); }
    }
    const { error } = await (await authClient()).auth.signInWithPassword({ email, password: body.password });
    if (error) return json({ error: 'Unable to sign in with these details. Check your username or email and password.' }, 401);
    return json({ ok: true });
}
