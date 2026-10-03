'use client';
import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { roles, roleLabels, roleDescriptions, type WorkspaceAccount, type WorkspaceRole } from '@/lib/permissions';

async function change(body: unknown) {
    const response = await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The account could not be saved.');
    return data as { setupPath?: string | null };
}
export default function Accounts() {
    const [accounts, setAccounts] = useState<WorkspaceAccount[]>([]);
    const [userId, setUserId] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<WorkspaceRole>('editor');
    const [setupLink, setSetupLink] = useState('');
    const [suspending, setSuspending] = useState<WorkspaceAccount | null>(null);
    const load = useCallback(async () => {
        try {
            const response = await fetch('/api/accounts');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setAccounts(data.accounts); setUserId(data.userId); setError('');
        } catch (error) { setError((error as Error).message); }
        finally { setLoaded(true); }
    }, []);
    useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
    async function run(body: unknown) {
        if (busy) return;
        setBusy(true);
        try {
            const data = await change(body);
            await load();
            if (data.setupPath) setSetupLink(window.location.origin + data.setupPath);
            setAdding(false); setSuspending(null);
            toast.success(data.setupPath ? 'Account ready. Share the setup link with this person.' : 'Account access saved.');
        } catch (error) { toast.error((error as Error).message); }
        finally { setBusy(false); }
    }
    return <>
        <div className="page-heading"><div><div className="eyebrow">WORKSPACE ACCESS</div><h1>Accounts & permissions</h1><p>Add your team and choose what each person can do.</p></div><div className="button-row"><Button variant="outline" disabled={busy} onClick={() => void load()}><RefreshCw size={16}/>Refresh accounts</Button><Button disabled={busy || !!error || !loaded} onClick={() => { setName(''); setEmail(''); setRole('editor'); setAdding(true); }}><Plus size={16}/>Add account</Button></div></div>
        <div className="role-grid">{roles.map(role => <section className="info-panel compact" key={role}><ShieldCheck size={20}/><div><h2>{roleLabels[role]}</h2><p>{roleDescriptions[role]}</p></div></section>)}</div>
        {error && <div className="error-panel" role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Retry accounts</Button></div>}
        {!loaded ? <p role="status">Loading accounts…</p> : !error && <div className="account-list">{accounts.map(account => <section className="account-row" key={`${account.id}-${account.revision}`} aria-label={`Account ${account.email}`}><div className="account-identity"><strong>{account.name}{account.id === userId ? ' (you)' : ''}</strong><span>{account.email}</span><small>{account.owner ? 'Workspace owner' : account.setupPending ? 'Awaiting password setup' : roleLabels[account.role]} · {account.status === 'active' ? 'Active access' : 'Suspended'}</small></div><div className="account-controls"><label className="field"><span>Role for {account.name}</span><select className="select-field" aria-label={`Role for ${account.email}`} value={account.role} disabled={busy || account.owner || account.id === userId} onChange={event => void run({ action: 'update', id: account.id, role: event.target.value, status: account.status, revision: account.revision })}>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>{!account.owner && account.id !== userId && <Button disabled={busy} variant="outline" onClick={() => account.status === 'active' ? setSuspending(account) : void run({ action: 'update', id: account.id, role: account.role, status: 'active', revision: account.revision })}>{account.status === 'active' ? 'Suspend access' : 'Restore access'}</Button>}{account.setupPending && account.status === 'active' && <Button disabled={busy} variant="outline" onClick={() => void run({ action: 'setup-link', id: account.id })}>New setup link</Button>}</div></section>)}</div>}
        <p className="method-note">Role changes and suspensions apply on the next request. The workspace owner keeps Admin access.</p>
        <Dialog open={adding} onOpenChange={value => { if (!busy) setAdding(value); }}><DialogContent><DialogHeader><DialogTitle>Add an account</DialogTitle><DialogDescription>This person will join your assessment workspace. New users set their own password using a one-time link.</DialogDescription></DialogHeader><form className="auth-form" onSubmit={event => { event.preventDefault(); void run({ action: 'add', name, email, role }); }}><label className="field"><span>Full name</span><Input required maxLength={100} autoComplete="name" value={name} onChange={event => setName(event.target.value)}/></label><label className="field"><span>Email address</span><Input required type="email" maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}/></label><label className="field"><span>Account role</span><select className="select-field" value={role} onChange={event => setRole(event.target.value as WorkspaceRole)}>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label><p>{roleDescriptions[role]}</p><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create account'}</Button></form></DialogContent></Dialog>
        <Dialog open={!!setupLink} onOpenChange={value => { if (!value) setSetupLink(''); }}><DialogContent><DialogHeader><DialogTitle>Share the account setup link</DialogTitle><DialogDescription>Send this one-time link directly to the account holder so they can set a password. A new link can be generated if it expires. No email has been sent.</DialogDescription></DialogHeader><label className="field"><span>Account setup link</span><Input readOnly value={setupLink} onFocus={event => event.target.select()}/></label><Button onClick={async () => { try { await navigator.clipboard.writeText(setupLink); toast.success('Setup link copied.'); } catch { toast.error('Select the link and copy it manually.'); } }}><Copy size={16}/>Copy setup link</Button></DialogContent></Dialog>
        <AlertDialog open={!!suspending} onOpenChange={value => { if (!busy && !value) setSuspending(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Suspend access for {suspending?.name}?</AlertDialogTitle><AlertDialogDescription>They will lose access to this workspace on their next request. Their work is kept, and you can restore access later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep access</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => { if (suspending) void run({ action: 'update', id: suspending.id, role: suspending.role, status: 'suspended', revision: suspending.revision }); }}>Suspend access</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>;
}
