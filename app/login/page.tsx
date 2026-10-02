import Login from './login';
import { authConfigured } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export default function LoginPage() {
    return <main className="candidate-main auth-main"><h1>Sign in to Resolvable Assess</h1><p>Admin and assessor access</p><Login configured={authConfigured()} /></main>;
}
