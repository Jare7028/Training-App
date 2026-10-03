import { redirect } from 'next/navigation';
import { authClient } from '@/lib/supabase/server';
import { getAssessmentAdmin } from '@/app/admin-auth';
import { firstRow } from '@/db/store';
import Onboarding from './onboarding';
import styles from '../login/login.module.css';
export const dynamic = 'force-dynamic';
export default async function OnboardingPage() {
    const { data: { user } } = await (await authClient()).auth.getUser();
    if (!user?.email_confirmed_at || user.is_anonymous) redirect('/login');
    if (await getAssessmentAdmin()) redirect('/');
    if (await firstRow('workspace_members', { id: user.id })) redirect('/');
    return <main className={styles.screen}><section className={styles.panel}><p className={styles.brand}>Resolvable Assess</p>
        <h1>Set up your business</h1><Onboarding business={typeof user.user_metadata.business_name === 'string' ? user.user_metadata.business_name : ''}
            name={typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name : ''}/>
        <form action="/auth/signout" method="post"><button type="submit">Sign out</button></form>
    </section></main>;
}
