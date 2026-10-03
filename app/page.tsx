import { redirect } from 'next/navigation';
import { authClient, authConfigured } from '@/lib/supabase/server';
import Admin from './workspace';
import { getAssessmentAdmin } from './admin-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
    if (!authConfigured()) return <main className="candidate-main"><h1>Workspace setup required</h1><p>Connect this deployment to Supabase to enable admin sign-in.</p></main>;
    if (!await getAssessmentAdmin()) {
        const { data: { user } } = await (await authClient()).auth.getUser();
        if (!user) redirect('/login');
        return <main className="candidate-main"><h1>Workspace access required</h1><p>Your account has no active workspace access. Contact your workspace admin, or use your assigned candidate link to take an assessment.</p><form action="/auth/signout" method="post"><button type="submit">Sign out</button></form></main>;
    }
    return <Admin />;
}
