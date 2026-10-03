import 'server-only';
import { authClient, authConfigured } from '@/lib/supabase/server';
import { firstRow } from '@/db/store';
import { serviceClient } from '@/lib/supabase/admin';
import { isRole } from '@/lib/permissions';

export function bootstrapAdmin(email: string) {
    return (process.env.ASSESS_ADMIN_EMAILS || '').split(',').some(value => value.trim().toLowerCase() === email.toLowerCase());
}

export async function getAssessmentAdmin() {
    if (!authConfigured()) return null;
    const { data: { user }, error } = await (await authClient()).auth.getUser();
    if (error || !user?.email || !user.email_confirmed_at || user.is_anonymous) return null;
    let member = await firstRow('workspace_members', { id: user.id });
    // The legacy allowlist bootstraps existing owners once. Stored membership
    // always wins, so stale environment configuration cannot restore access.
    if (!member && bootstrapAdmin(user.email)) {
        const { error } = await serviceClient().from('workspace_members').upsert({
            id: user.id, workspace_owner: user.id, email: user.email.toLowerCase(),
            name: ((typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '') || user.email).slice(0, 100),
            role: 'admin', status: 'active', created_at: Date.now(), revision: 1,
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw new Error('Unable to prepare workspace membership.');
        member = await firstRow('workspace_members', { id: user.id });
    }
    if (!member || member.status !== 'active' || !isRole(member.role)) return null;
    return { userId: user.id, workspaceOwner: String(member.workspace_owner), email: user.email, displayName: String(member.name), role: member.role };
}
