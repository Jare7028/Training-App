'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type Business = { id: string; name: string };
export default function TenantSwitcher({ current, businesses }: { current: string; businesses: Business[] }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function switchBusiness(tenantId: string) {
        setBusy(true); setError('');
        try {
            const response = await fetch('/api/tenants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            // The workspace is keyed by tenant ID, discarding all old tenant state.
            router.push('/'); router.refresh();
        } catch (error) { setError((error as Error).message); setBusy(false); }
    }
    return <div><label className="field"><span>Global admin · Business</span><select className="select-field" value={current} disabled={busy} onChange={e => {
        if (window.confirm('Switch business? Any unsaved changes will be discarded.')) void switchBusiness(e.target.value);
    }}>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><p role="status">{error}</p></div>;
}
