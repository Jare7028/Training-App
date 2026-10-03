'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export default function Onboarding({ business, name }: { business: string; name: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault(); setBusy(true); setMessage('');
        try {
            const response = await fetch('/api/business', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            router.push('/'); router.refresh();
        } catch (error) { setMessage((error as Error).message); setBusy(false); }
    }
    return <form className="auth-form" onSubmit={submit}>
        <label className="field"><span>Business name</span><Input name="businessName" defaultValue={business} required maxLength={100}/></label>
        <label className="field"><span>Your name</span><Input name="contactName" defaultValue={name} required maxLength={100}/></label>
        <p role="status">{message}</p><Button type="submit" disabled={busy}>{busy ? 'Creating workspace…' : 'Create workspace'}</Button>
    </form>;
}
