import { finishBusinessSignup } from '@/lib/businesses';
import { NextResponse } from 'next/server';
import { authClient, authConfigured } from '@/lib/supabase/server';
import { requestOrigin } from '@/lib/request-origin';
export async function GET(request: Request) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token_hash');
    const type = url.searchParams.get('type');
    if (token && ['invite', 'recovery', 'email'].includes(type || '') && authConfigured()) {
        const { error } = await (await authClient()).auth.verifyOtp({ token_hash: token, type: type as 'invite' | 'recovery' | 'email' });
        if (!error) {
            try { await finishBusinessSignup(); } catch { return NextResponse.redirect(new URL('/onboarding', requestOrigin(request))); }
            return NextResponse.redirect(new URL(type === 'email' ? '/' : '/account/password', requestOrigin(request)));
        }
    }
    return NextResponse.redirect(new URL('/login?error=link', requestOrigin(request)));
}
