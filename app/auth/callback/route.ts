import { finishBusinessSignup } from '@/lib/businesses';
import { NextResponse } from 'next/server';
import { authClient, authConfigured } from '@/lib/supabase/server';
import { requestOrigin } from '@/lib/request-origin';
export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (code && authConfigured()) {
        const { error } = await (await authClient()).auth.exchangeCodeForSession(code);
        if (!error) {
            try { await finishBusinessSignup(); } catch { return NextResponse.redirect(new URL('/onboarding', requestOrigin(request))); }
            return NextResponse.redirect(new URL(url.searchParams.get('next') === '/account/password' ? '/account/password' : '/', requestOrigin(request)));
        }
    }
    return NextResponse.redirect(new URL('/login?error=link', requestOrigin(request)));
}
