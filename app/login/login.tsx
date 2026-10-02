'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/supabase/browser';

export default function Login({ configured }: { configured: boolean }) {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    async function signIn(event: React.FormEvent) {
        event.preventDefault(); setBusy(true); setMessage('');
        try {
            const response = await fetch('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            router.push('/'); router.refresh();
        } catch (error) { setMessage((error as Error).message || 'Unable to sign in. Please retry.'); }
        finally { setBusy(false); }
    }
    async function reset() {
        if (!email.trim()) { setMessage('Enter your email address first.'); return; }
        setBusy(true); setMessage('');
        try {
            const { error } = await authClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=/account/password` });
            if (error) throw new Error('We could not send the reset email. Please retry.');
            setMessage('If this email has an account, a password reset link will arrive shortly.');
        } catch (error) { setMessage((error as Error).message); }
        finally { setBusy(false); }
    }
    if (!configured) return <p role="status">Admin sign-in is available once workspace setup is complete.</p>;
    return <form onSubmit={signIn} className="auth-form">
        <label className="field"><span>Email address</span><Input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254}/></label>
        <label className="field"><span>Password</span><Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={256}/></label>
        <p role="status" aria-live="polite">{message}</p>
        <Button disabled={busy} type="submit">{busy ? 'Please wait…' : 'Sign in'}</Button>
        <Button disabled={busy} variant="outline" type="button" onClick={reset}>Reset password</Button>
        <p>Candidates: use your assigned assessment link.</p>
    </form>;
}
