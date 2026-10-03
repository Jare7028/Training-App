import { redirect } from 'next/navigation';
import { authClient, authConfigured } from '@/lib/supabase/server';
import Admin from './workspace';
import { getAssessmentAdmin } from './admin-auth';
import { firstRow } from '@/db/store';
export const dynamic = 'force-dynamic';
export default async function Home() {
    if (!authConfigured()) return <main className="candidate-main"><h1>Workspace setup required</h1><p>Connect this deployment to Supabase to enable admin sign-in.</p></main>;
    const admin = await getAssessmentAdmin();
    if (!admin) {
        const { data: { user } } = await (await authClient()).auth.getUser();
        if (!user) redirect('/login');
        if (user.email_confirmed_at && !user.is_anonymous && !await firstRow('workspace_members', { id: user.id })) redirect('/onboarding');
        return <main className="candidate-main"><h1>Workspace access required</h1><p>Your account has no active workspace access. Contact your workspace admin, or use your assigned candidate link to take an assessment.</p><form action="/auth/signout" method="post"><button type="submit">Sign out</button></form></main>;
    }
    const { data: businesses, error } = await (await authClient()).from('tenants').select('id, name').order('name');
    if (error) throw new Error('Unable to load businesses.');
    return <Admin key={admin.tenantId} tenantId={admin.tenantId} tenantName={admin.tenantName} isGlobalAdmin={admin.isGlobalAdmin} businesses={businesses} />;
}
