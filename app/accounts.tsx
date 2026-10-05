'use client';
import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { roles, roleLabels, roleDescriptions, type WorkspaceAccount, type WorkspaceRole } from '@/lib/permissions';

async function change(body: unknown, tenantId: string) {
    const response = await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The account could not be saved.');
    return data as { ok: boolean };
}
export default function Accounts({ tenantId }: { tenantId: string }) {
    const [accounts, setAccounts] = useState<WorkspaceAccount[]>([]);
    const [userId, setUserId] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [activating, setActivating] = useState<WorkspaceAccount | null>(null);
    const [role, setRole] = useState<WorkspaceRole>('editor');
    const [suspending, setSuspending] = useState<WorkspaceAccount | null>(null);
    const load = useCallback(async () => {
        try {
            const response = await fetch('/api/accounts', { headers: { 'X-Tenant-Id': tenantId } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setAccounts(data.accounts); setUserId(data.userId); setError('');
        } catch (error) { setError((error as Error).message); }
        finally { setLoaded(true); }
    }, [tenantId]);
    useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
    async function run(body: unknown) {
        if (busy) return;
        setBusy(true);
        try {
            await change(body, tenantId);
            await load();
            setAdding(false); setSuspending(null); setActivating(null); setPassword(''); setShowPassword(false);
            toast.success('Account saved.');
        } catch (error) { toast.error((error as Error).message); }
        finally { setBusy(false); }
    }
    return <>
        <div className="page-heading"><div><div className="eyebrow">WORKSPACE ACCESS</div><h1>Accounts & permissions</h1><p>Add your team and choose what each person can do.</p></div><div className="button-row"><Button variant="outline" disabled={busy} onClick={() => void load()}><RefreshCw size={16}/>Refresh accounts</Button><Button disabled={busy || !!error || !loaded} onClick={() => { setName(''); setUsername(''); setPassword(''); setShowPassword(false); setRole('editor'); setAdding(true); }}><Plus size={16}/>Add account</Button></div></div>
        <div className="role-grid">{roles.map(role => <section className="info-panel compact" key={role}><ShieldCheck size={20}/><div><h2>{roleLabels[role]}</h2><p>{roleDescriptions[role]}</p></div></section>)}</div>
        {error && <div className="error-panel" role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Retry accounts</Button></div>}
        {!loaded ? <p role="status">Loading accounts…</p> : !error && <div className="account-list">{accounts.map(account => <section className="account-row" key={`${account.id}-${account.revision}`} aria-label={`Account ${account.username || account.email}`}><div className="account-identity"><strong>{account.name}{account.id === userId ? ' (you)' : ''}</strong><span>{account.username || account.email}</span><small>{account.owner ? 'Workspace owner' : account.setupPending ? 'Awaiting password setup' : roleLabels[account.role]} · {account.status === 'active' ? 'Active access' : 'Suspended'}</small></div><div className="account-controls"><label className="field"><span>Role for {account.name}</span><select className="select-field" aria-label={`Role for ${account.username || account.email}`} value={account.role} disabled={busy || account.owner || account.id === userId} onChange={event => void run({ action: 'update', id: account.id, role: event.target.value, status: account.status, revision: account.revision })}>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>{!account.owner && account.id !== userId && <Button disabled={busy} variant="outline" onClick={() => account.status === 'active' ? setSuspending(account) : void run({ action: 'update', id: account.id, role: account.role, status: 'active', revision: account.revision })}>{account.status === 'active' ? 'Suspend access' : 'Restore access'}</Button>}{account.setupPending && account.status === 'active' && <Button disabled={busy} variant="outline" onClick={() => {setActivating(account);setPassword('');setShowPassword(false);}}>Set password</Button>}</div></section>)}</div>}
        <p className="method-note">Role changes and suspensions apply on the next request. The workspace owner keeps Admin access.</p>
        <Dialog open={adding || !!activating} onOpenChange={value => { if (!busy && !value) {setAdding(false);setActivating(null);setPassword('');setShowPassword(false);} }}><DialogContent><DialogHeader><DialogTitle>{activating?'Set account password':'Add an account'}</DialogTitle><DialogDescription>{activating ? `Sign in with ${activating.email}.` : 'Create their sign-in details.'}</DialogDescription></DialogHeader><form className="auth-form" onSubmit={event => { event.preventDefault(); void run(activating ? {action:'activate',id:activating.id,password} : { action: 'create', name, username, password, role }); }}>
        {!activating && <><label className="field"><span>Username</span><Input required minLength={3} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,39}" autoComplete="off" autoCapitalize="none" spellCheck={false} value={username} onChange={event => setUsername(event.target.value)}/></label><label className="field"><span>Name (optional)</span><Input maxLength={100} autoComplete="off" value={name} onChange={event => setName(event.target.value)}/></label></>}
        <label className="field"><span>Password</span><Input required type={showPassword?'text':'password'} minLength={12} maxLength={256} autoComplete="new-password" placeholder="At least 12 characters" value={password} onChange={event => setPassword(event.target.value)}/></label><Button type="button" variant="ghost" onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>} {showPassword?'Hide password':'Show password'}</Button>
        {!activating && <label className="field"><span>Account role</span><select className="select-field" value={role} onChange={event => setRole(event.target.value as WorkspaceRole)}>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : activating?'Save password':'Create account'}</Button></form></DialogContent></Dialog>
        <AlertDialog open={!!suspending} onOpenChange={value => { if (!busy && !value) setSuspending(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Suspend access for {suspending?.name}?</AlertDialogTitle><AlertDialogDescription>They will lose access to this workspace on their next request. Their work is kept, and you can restore access later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep access</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => { if (suspending) void run({ action: 'update', id: suspending.id, role: suspending.role, status: 'suspended', revision: suspending.revision }); }}>Suspend access</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>;
}
