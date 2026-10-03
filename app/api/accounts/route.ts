import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bootstrapAdmin, getAssessmentAdmin } from '@/app/admin-auth';
import { allRows, firstRow, insertRow, updateRows, type RecordRow } from '@/db/privileged-store';
import { serviceClient } from '@/lib/supabase/admin';
import { sameOrigin } from '@/lib/request-origin';
import { roles, type WorkspaceAccount } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
const input = z.discriminatedUnion('action', [
    z.object({ action: z.literal('add'), email: z.string().trim().toLowerCase().email().max(254), name: z.string().trim().min(1).max(100), role: z.enum(roles) }).strict(),
    z.object({ action: z.literal('update'), id: z.string().uuid(), role: z.enum(roles), status: z.enum(['active', 'suspended']), revision: z.number().int().positive() }).strict(),
    z.object({ action: z.literal('setup-link'), id: z.string().uuid() }).strict(),
]);
function account(row: RecordRow, owner: string): WorkspaceAccount {
    return { id: String(row.id), email: String(row.email), name: String(row.name), role: row.role as WorkspaceAccount['role'], status: row.status as WorkspaceAccount['status'], revision: Number(row.revision), createdAt: Number(row.created_at), owner: row.id === owner, setupPending: false };
}
function setupPath(token: string, type: string) {
    return `/auth/confirm?${new URLSearchParams({ token_hash: token, type })}`;
}
export async function GET(request: Request) {
    try {
        const user = await getAssessmentAdmin();
        const requestedTenant = request.headers.get('x-tenant-id');
        if (user && requestedTenant && requestedTenant !== user.tenantId) return json({ error: 'The selected business changed. Reload before continuing.' }, 409);
        if (!user) return json({ error: 'Sign in to continue.' }, 401);
        if (user.role !== 'admin') return json({ error: 'Only Admins can manage accounts.' }, 403);
        const rows = await allRows('workspace_members', { workspace_owner: user.workspaceOwner }, { order: 'created_at' });
        const admin = serviceClient().auth.admin;
        const accounts = await Promise.all(rows.map(async row => {
            const { data, error } = await admin.getUserById(String(row.id));
            if (error) throw new Error('Account status lookup failed.');
            return { ...account(row, user.workspaceOwner), email: data.user.email || String(row.email), setupPending: !data.user.email_confirmed_at };
        }));
        return json({ accounts, userId: user.userId });
    } catch (error) {
        console.error('Account load failed', error);
        return json({ error: 'Accounts could not be loaded. Please retry.' }, 503);
    }
}
export async function POST(request: Request) {
    try {
        const user = await getAssessmentAdmin();
        const requestedTenant = request.headers.get('x-tenant-id');
        if (user && requestedTenant && requestedTenant !== user.tenantId) return json({ error: 'The selected business changed. Reload before continuing.' }, 409);
        if (!user) return json({ error: 'Sign in to continue.' }, 401);
        if (user.role !== 'admin') return json({ error: 'Only Admins can manage accounts.' }, 403);
        if (!sameOrigin(request)) return json({ error: 'Invalid request origin.' }, 403);
        if (Number(request.headers.get('content-length')) > 4000) return json({ error: 'Request is too large.' }, 413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 4000) return json({ error: 'Request is too large.' }, 413);
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
        const result = input.safeParse(parsed);
        if (!result.success) return json({ error: 'Enter a valid name, email address and role, or reload the account before updating it.' }, 400);
        const body = result.data;
        const admin = serviceClient().auth.admin;
        if (body.action === 'add') {
            if (bootstrapAdmin(body.email)) return json({ error: 'This account is configured as a workspace owner and keeps its separate workspace.' }, 409);
            // Paginate the trusted Auth API; never return its project-wide user
            // directory to the browser or change an existing user's credentials.
            let existing;
            for (let page = 1; ; page++) {
                const { data, error } = await admin.listUsers({ page, perPage: 1000 });
                if (error) throw new Error('Account lookup failed.');
                existing = data.users.find(item => item.email?.toLowerCase() === body.email);
                if (existing || data.users.length < 1000) break;
            }
            if (existing && (await firstRow('workspace_members', { id: existing.id }) || existing.user_metadata?.business_name))
                return json({ error: 'This account already belongs to a workspace. Manage its existing access instead.' }, 409);
            let newUser = false;
            let path: string | null = null;
            if (!existing) {
                const { data, error } = await admin.generateLink({ type: 'invite', email: body.email });
                if (error || !data.user || !data.properties) return json({ error: 'The account could not be created. Please retry.' }, 503);
                existing = data.user;
                newUser = true;
                path = setupPath(data.properties.hashed_token, data.properties.verification_type);
            }
            try {
                await insertRow('workspace_members', { id: existing.id, workspace_owner: user.workspaceOwner, email: body.email, name: body.name, role: body.role, status: 'active', created_at: Date.now(), revision: 1 });
            } catch (error) {
                if (newUser) await admin.deleteUser(existing.id);
                throw error;
            }
            return json({ ok: true, setupPath: path });
        }
        const member = await firstRow('workspace_members', { id: body.id, workspace_owner: user.workspaceOwner });
        if (!member) return json({ error: 'Account not found.' }, 404);
        if (body.action === 'update') {
            if (body.id === user.workspaceOwner || body.id === user.userId)
                return json({ error: 'You cannot change your own access or the workspace owner’s access.' }, 403);
            const count = await updateRows('workspace_members', { role: body.role, status: body.status, revision: body.revision + 1 }, { id: body.id, workspace_owner: user.workspaceOwner, revision: body.revision });
            if (!count) return json({ error: 'This account changed in another tab. Reload before saving.' }, 409);
            return json({ ok: true });
        }
        if (member.status !== 'active') return json({ error: 'Restore account access before generating a setup link.' }, 400);
        const { data: identity, error: lookupError } = await admin.getUserById(body.id);
        if (lookupError || !identity.user?.email) throw new Error('Account lookup failed.');
        // Confirmed accounts use their own password reset flow. Admins cannot
        // generate login tokens for an existing confirmed account.
        if (identity.user.email_confirmed_at) return json({ error: 'This account is already set up. The user can reset their password from the sign-in page.' }, 400);
        const { data, error } = await admin.generateLink({ type: 'invite', email: identity.user.email });
        if (error || !data.properties) return json({ error: 'The setup link could not be generated. Please retry.' }, 503);
        return json({ ok: true, setupPath: setupPath(data.properties.hashed_token, data.properties.verification_type) });
    } catch (error) {
        console.error('Account change failed', error);
        return json({ error: 'The account change could not be saved. Please reload and retry.' }, 503);
    }
}
