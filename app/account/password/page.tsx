'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export default function PasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (password.length < 12 || password !== confirm) { setMessage('Use at least 12 characters and make sure both passwords match.'); return; }
        setBusy(true); setMessage('');
        try {
            const { error } = await authClient().auth.updateUser({ password });
            if (error) throw new Error('This link may have expired. Request a new password reset email.');
            router.push('/'); router.refresh();
        } catch (error) { setMessage((error as Error).message); }
        finally { setBusy(false); }
    }
    return <main className="candidate-main auth-main"><h1>Set your password</h1><form onSubmit={save} className="auth-form">
        <label className="field"><span>New password</span><Input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={e => setPassword(e.target.value)}/></label>
        <label className="field"><span>Confirm password</span><Input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirm} onChange={e => setConfirm(e.target.value)}/></label>
        <p role="status" aria-live="polite">{message}</p><Button type="submit" disabled={busy}>Save password</Button><Link href="/login">Back to sign in</Link>
    </form></main>;
}
