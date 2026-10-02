import { NextResponse } from 'next/server';
import { authClient, authConfigured } from '@/lib/supabase/server';
export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (code && authConfigured()) {
        const { error } = await (await authClient()).auth.exchangeCodeForSession(code);
        if (!error) return NextResponse.redirect(new URL(url.searchParams.get('next') === '/account/password' ? '/account/password' : '/', url.origin));
    }
    return NextResponse.redirect(new URL('/login?error=link', url.origin));
}
