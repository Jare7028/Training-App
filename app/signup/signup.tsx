'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import styles from '../login/login.module.css';

export default function Signup({ configured }: { configured: boolean }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [sent, setSent] = useState(false);
    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault(); setBusy(true); setMessage('');
        const values = Object.fromEntries(new FormData(event.currentTarget));
        try {
            const response = await fetch('/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            if (data.ready) { router.push('/'); router.refresh(); return; }
            setSent(true); setMessage(data.message);
        } catch (error) { setMessage((error as Error).message); }
        finally { setBusy(false); }
    }
    if (!configured) return <p role="status">Signup is available once workspace setup is complete.</p>;
    return <form onSubmit={submit} className={`auth-form ${styles.form}`}>
        {!sent && <>
            <label className="field"><span>Business name</span><Input name="businessName" autoComplete="organization" required maxLength={100}/></label>
            <label className="field"><span>Your name</span><Input name="contactName" autoComplete="name" required maxLength={100}/></label>
            <label className="field"><span>Email address</span><Input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
            <label className="field"><span>Password</span><Input name="password" type="password" aria-label="Password" aria-describedby="signup-password-help" autoComplete="new-password" required minLength={12} maxLength={256}/><small id="signup-password-help">At least 12 characters.</small></label>
            <Button type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create business account'}</Button>
        </>}
        <p className={styles.feedback} role="status" aria-live="polite">{message}</p>
    </form>;
}
