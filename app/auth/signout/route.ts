import { NextResponse } from 'next/server';
import { requestOrigin, sameOrigin } from '@/lib/request-origin';
import { authClient, authConfigured } from '@/lib/supabase/server';
export async function POST(request: Request) {
    if (!sameOrigin(request)) return new Response('Invalid request origin.', { status: 403 });
    if (authConfigured()) await (await authClient()).auth.signOut();
    return NextResponse.redirect(new URL('/login', requestOrigin(request)), 303);
}
