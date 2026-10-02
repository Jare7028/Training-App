import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function authConfigured() {
    return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}
export async function authClient() {
    const jar = await cookies();
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, {
        cookies: {
            getAll: () => jar.getAll(),
            setAll: values => {
                // Server Components cannot write cookies. proxy.ts refreshes
                // those requests; route handlers may write directly.
                try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); }
                catch { /* Cookie updates are handled by proxy.ts. */ }
            },
        },
    });
}
