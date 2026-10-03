import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authClient, authConfigured } from '@/lib/supabase/server';
import { sameOrigin, requestOrigin } from '@/lib/request-origin';
import { finishBusinessSignup } from '@/lib/businesses';

const input = z.object({
    businessName: z.string().trim().min(1).max(100),
    contactName: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(12).max(256),
}).strict();
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
    try {
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
        if (!authConfigured()) return json({ error: 'Signup is not configured yet.' }, 503);
        if (Number(request.headers.get('content-length')) > 4000) return json({ error: 'Request is too large.' }, 413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 4000) return json({ error: 'Request is too large.' }, 413);
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
        const result = input.safeParse(parsed);
        if (!result.success) return json({ error: 'Enter your business, name, a valid email and a password of at least 12 characters.' }, 400);
        const db = await authClient();
        const { data: { user: signedIn } } = await db.auth.getUser();
        if (signedIn) return json({ error: 'Sign out before registering a new business.' }, 409);
        const { businessName, contactName, email, password } = result.data;
        const { data, error } = await db.auth.signUp({ email, password, options: {
            data: { business_name: businessName, full_name: contactName },
            emailRedirectTo: `${requestOrigin(request)}/auth/callback`,
        } });
        if (error?.code === 'signup_disabled') return json({ error: 'Business registration is temporarily closed. Please try again later.' }, 503);
        if (error) return json({ error: error.status === 429 ? 'Please wait before trying signup again.' : 'Signup could not be completed. Please retry, or sign in if you already have an account.' }, error.status === 429 ? 429 : 400);
        // When email confirmation is disabled, Supabase confirms the account
        // and returns a session immediately. Both flows use the same tenant RPC.
        if (data.session) { await finishBusinessSignup(); return json({ ready: true }); }
        return json({ ready: false, message: 'Check your email to verify your account. If you already have an account, sign in instead.' });
    } catch (error) {
        console.error('Business signup failed', error);
        return json({ error: 'Signup is temporarily unavailable. Please retry.' }, 503);
    }
}
