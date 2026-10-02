import 'server-only';
import { authClient, authConfigured } from '@/lib/supabase/server';

export async function getAssessmentAdmin() {
    if (!authConfigured()) return null;
    const { data: { user }, error } = await (await authClient()).auth.getUser();
    if (error || !user?.email) return null;
    const allowed = (process.env.ASSESS_ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!allowed.includes(user.email.toLowerCase())) return null;
    return { userId: user.id, email: user.email, displayName: user.user_metadata?.full_name || user.email };
}
