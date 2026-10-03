import 'server-only';
import { authClient, authConfigured } from '@/lib/supabase/server';
import { firstRow } from '@/db/store';
import { isRole } from '@/lib/permissions';
import { cookies } from 'next/headers';
import { createBusiness } from '@/lib/businesses';

export const tenantCookie = 'assess-tenant';

export function bootstrapAdmin(email: string) {
    return (process.env.ASSESS_ADMIN_EMAILS || '').split(',').some(value => value.trim().toLowerCase() === email.toLowerCase());
}

export async function getAssessmentAdmin() {
    if (!authConfigured()) return null;
    const { data: { user }, error } = await (await authClient()).auth.getUser();
    if (error || !user?.email || !user.email_confirmed_at || user.is_anonymous) return null;
    let member = await firstRow('workspace_members', { id: user.id });
    // Legacy allowlisted accounts can create their own business once. This
    // grants no global permissions and never restores suspended membership.
    if (!member && bootstrapAdmin(user.email)) {
        await createBusiness('Workspace', user.email);
        member = await firstRow('workspace_members', { id: user.id });
    }
    const db = await authClient();
    const { data: global, error: globalError } = await db.from('global_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (globalError) throw new Error('Unable to check global permissions.');
    const isGlobalAdmin = !!global;
    if (!member || (!isGlobalAdmin && member.status !== 'active') || !isRole(member.role)) return null;
    const selected = isGlobalAdmin ? (await cookies()).get(tenantCookie)?.value : null;
    let { data: tenant, error: tenantError } = await db.from('tenants').select('id, name, owner_id')
        .eq('id', selected && /^[0-9a-f-]{36}$/i.test(selected) ? selected : String(member.tenant_id)).maybeSingle();
    if (!tenant && !tenantError && selected) {
        ({ data: tenant, error: tenantError } = await db.from('tenants').select('id, name, owner_id').eq('id', String(member.tenant_id)).maybeSingle());
    }
    if (tenantError) throw new Error('Unable to load business.');
    if (!tenant) return null;
    return { userId: user.id, workspaceOwner: tenant.owner_id as string, tenantId: tenant.id as string,
        tenantName: tenant.name as string, isGlobalAdmin, email: user.email,
        displayName: String(member.name), role: isGlobalAdmin ? 'admin' as const : member.role };
}
