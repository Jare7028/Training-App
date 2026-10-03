'use client';
import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { Plus, RefreshCw, Settings2, Paperclip, ArrowLeft, ArrowRight, Trash2, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { canEdit, type WorkspaceRole } from '@/lib/permissions';
import { maxRequestImageBytes, requestPriorities, type RequestColumn, type RequestAssignee, type WorkspaceRequest } from '@/lib/requests';

type Board = { columns: RequestColumn[]; revision: number; requests: WorkspaceRequest[]; users: RequestAssignee[]; tenantId: string; userId: string; role: WorkspaceRole };
type Draft = Pick<WorkspaceRequest, 'id' | 'revision' | 'title' | 'description' | 'columnId' | 'assigneeId' | 'priority'>;
type PendingImage = { id: string; file: File; url: string };
async function responseData(response: Response) {
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not save. Please retry.'); return data;
}
async function uploadFile(file: File) {
    if (file.size <= maxRequestImageBytes) return file;
    // A full-resolution clipboard screenshot can exceed Vercel's request limit.
    const bitmap = await createImageBitmap(file);
    try {
        const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext('2d'); if (!context) throw new Error('This image could not be prepared.');
        context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
        if (!blob || blob.size > maxRequestImageBytes) throw new Error('Try a smaller screenshot.');
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } finally { bitmap.close(); }
}
export default function Requests() {
    const [board, setBoard] = useState<Board | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [query, setQuery] = useState(''), [assignee, setAssignee] = useState('all'), [dragged, setDragged] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null), [baseline, setBaseline] = useState(''), [pending, setPending] = useState<PendingImage[]>([]);
    const [columns, setColumns] = useState<RequestColumn[] | null>(null), [discard, setDiscard] = useState(false), [archiving, setArchiving] = useState(false);
    const flight = useRef(false), urls = useRef(new Map<string, string>()), fileInput = useRef<HTMLInputElement>(null);
    const editable = board ? canEdit(board.role) : false;
    const load = useCallback(async () => {
        const data = await responseData(await fetch('/api/requests')); setBoard(data); return data as Board;
    }, []);
    useEffect(() => { let active = true; void fetch('/api/requests').then(responseData).then(data => { if (active) setBoard(data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
    useEffect(() => { const pool = urls.current; return () => { for (const url of pool.values()) URL.revokeObjectURL(url); }; }, []);
    const dirty = !!draft && (JSON.stringify(draft) !== baseline || pending.length > 0);
    useEffect(() => { if (!dirty) return; const handler = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [dirty]);
    const run = async (work: () => Promise<void>) => {
        if (flight.current) return; flight.current = true; setBusy(true); setError('');
        try { await work(); } catch (e) { setError((e as Error).message); } finally { flight.current = false; setBusy(false); }
    };
    const post = async (body: unknown) => {
        const data = await responseData(await fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Assess-Tenant': board!.tenantId }, body: JSON.stringify(body) }));
        setBoard(current => current ? { ...current, ...data } : current); return data;
    };
    const clearPending = () => { for (const url of urls.current.values()) URL.revokeObjectURL(url); urls.current.clear(); setPending([]); };
    const close = () => { clearPending(); setDraft(null); setError(''); setDiscard(false); setArchiving(false); };
    const open = (card?: WorkspaceRequest, columnId?: string) => {
        if (!board) return; clearPending();
        const next: Draft = card ? { id: card.id, revision: card.revision, title: card.title, description: card.description, columnId: card.columnId, assigneeId: card.assigneeId, priority: card.priority } : { id: crypto.randomUUID(), revision: 0, title: '', description: '', columnId: columnId || board.columns[0].id, assigneeId: null, priority: 'normal' };
        setDraft(next); setBaseline(JSON.stringify(next)); setError('');
    };
    const addImages = (files: File[]) => {
        if (!editable || busy) return;
        const valid = files.filter(file => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type));
        if (valid.length !== files.length) setError('Use PNG, JPEG, WebP or GIF images.');
        const additions = valid.map(file => { const id = crypto.randomUUID(), url = URL.createObjectURL(file); urls.current.set(id, url); return { id, file, url }; });
        setPending(current => [...current, ...additions]);
    };
    const paste = (event: ClipboardEvent) => {
        const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file);
        if (files.length && editable && !busy) { event.preventDefault(); addImages(files); }
    };
    const save = () => run(async () => {
        if (!draft) return;
        const data = await post({ action: 'save', ...draft }), saved = data.requests.find((card: WorkspaceRequest) => card.id === draft.id);
        if (!saved) throw new Error('The saved request could not be loaded.');
        const next = { ...draft, revision: saved.revision }; setDraft(next); setBaseline(JSON.stringify(next));
        for (const image of pending) {
            const form = new FormData(); form.set('requestId', draft.id); form.set('id', image.id); form.set('file', await uploadFile(image.file));
            await responseData(await fetch('/api/requests/images', { method: 'POST', headers: { 'X-Assess-Tenant': board!.tenantId }, body: form }));
            URL.revokeObjectURL(image.url); urls.current.delete(image.id); setPending(current => current.filter(p => p.id !== image.id));
        }
        await load(); close(); toast.success('Request saved.');
    });
    const move = (id: string, columnId: string, beforeId?: string) => run(async () => {
        const card = board?.requests.find(c => c.id === id); if (!card || id === beforeId) return;
        await post({ action: 'move', id, columnId, beforeId, revision: card.revision }); toast.success('Request moved.');
    });
    const current = board?.requests.find(card => card.id === draft?.id);
    const visible = board?.requests.filter(card => (!query || (card.title + ' ' + card.description).toLowerCase().includes(query.toLowerCase())) && (assignee === 'all' || (assignee === 'unassigned' ? !card.assigneeId : card.assigneeId === (assignee === 'me' ? board.userId : assignee)))) || [];
    const ownerName = (id: string | null) => id ? board?.users.find(user => user.id === id)?.name || 'Former user' : 'Unassigned';
    return <section className="requests-workspace">
        <div className="page-heading"><h1>Requests</h1><div className="button-row"><Button variant="outline" aria-label="Refresh requests" disabled={busy} onClick={() => void run(async () => { await load(); })}><RefreshCw size={16}/></Button>{editable && <><Button variant="outline" aria-label="Edit columns" onClick={() => { setColumns(board!.columns.map(c => ({ ...c }))); setError(''); }}><Settings2 size={16}/><span className="requests-columns-label">Edit columns</span></Button><Button onClick={() => open()}><Plus size={18}/>New request</Button></>}</div></div>
        {error && !draft && !columns && <p className="submission-error" role="alert">{error}</p>}
        {!board ? <>{!error && <p role="status">Loading requests…</p>}</> : <>
            <div className="requests-toolbar"><label><span className="sr-only">Search requests</span><Input placeholder="Search requests" value={query} onChange={e => setQuery(e.target.value)}/></label><label><span className="sr-only">Filter by assignee</span><select aria-label="Filter by assignee" value={assignee} onChange={e => setAssignee(e.target.value)}><option value="all">All assignees</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option>{board.users.map(user => <option key={user.id} value={user.id}>{user.name}{user.status !== 'active' ? ' (inactive)' : ''}</option>)}</select></label></div>
            <div className="requests-board" aria-label="Requests board">
                {board.columns.map(column => <section key={column.id} className={`request-column${dragged ? ' accepting-drop' : ''}`} aria-label={column.name} onDragOver={event => { if (editable && dragged && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={event => { event.preventDefault(); if (editable && dragged && !busy) void move(dragged, column.id); setDragged(null); }}>
                    <div className="request-column-heading"><h2>{column.name}</h2><span>{visible.filter(card => card.columnId === column.id).length}</span>{editable && <Button variant="ghost" size="icon" aria-label={'Add request to ' + column.name} disabled={busy} onClick={() => open(undefined, column.id)}><Plus size={16}/></Button>}</div>
                    <div className="request-column-cards">{visible.filter(card => card.columnId === column.id).map(card => <article key={card.id} className={`request-card${dragged === card.id ? ' dragging' : ''}`} draggable={editable && !busy} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', card.id); setDragged(card.id); }} onDragEnd={() => setDragged(null)} onDrop={event => { if (dragged && editable && !busy) { event.preventDefault(); event.stopPropagation(); void move(dragged, column.id, card.id); setDragged(null); } }}>
                        <button type="button" className="request-card-open" aria-label={'Open request: ' + card.title} onClick={() => open(card)} disabled={busy}>
                            {card.priority !== 'normal' && <span className={'request-priority priority-' + card.priority}>{card.priority}</span>}
                            <span className="request-card-title">{card.title}</span>{card.description && <span className="request-card-description">{card.description}</span>}
                            {/* Protected session-bound images cannot use the public Next image optimiser. */}
                            
                            {card.images[0] && <Image unoptimized width={1200} height={800} className="request-card-image" src={card.images[0].url} alt={card.images[0].name}/>}
                            <span className="request-card-meta"><span>{ownerName(card.assigneeId)}</span>{card.images.length > 0 && <span aria-label={card.images.length + ' images'}><Paperclip size={14}/>{card.images.length}</span>}</span>
                        </button>
                    </article>)}</div>
                </section>)}
            </div>
        </>}
        <Dialog open={!!draft} onOpenChange={value => { if (!value && !busy) { if (dirty) setDiscard(true); else close(); } }}>
            <DialogContent className="request-editor" onPaste={paste} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
                <DialogHeader><DialogTitle>{draft?.revision ? editable ? 'Edit request' : 'Request' : 'New request'}</DialogTitle><DialogDescription className="sr-only">Request details and attached images.</DialogDescription></DialogHeader>
                {draft && <form onSubmit={event => { event.preventDefault(); if (editable && !busy) void save(); }}>
                    <label className="field"><span>Title</span><Input aria-label="Request title" value={draft.title} maxLength={200} required readOnly={!editable || busy} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label>
                    <label className="field"><span>Description</span><Textarea aria-label="Request description" value={draft.description} maxLength={10000} rows={5} readOnly={!editable || busy} onChange={event => setDraft({ ...draft, description: event.target.value })}/></label>
                    <div className="request-details-grid"><label className="field"><span>Column</span><select aria-label="Request column" disabled={!editable || busy} value={draft.columnId} onChange={event => setDraft({ ...draft, columnId: event.target.value })}>{board?.columns.map(column => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label><label className="field"><span>Assigned to</span><select aria-label="Assign request to" disabled={!editable || busy} value={draft.assigneeId || ''} onChange={event => setDraft({ ...draft, assigneeId: event.target.value || null })}><option value="">Unassigned</option>{board?.users.filter(user => user.status === 'active' || user.id === draft.assigneeId).map(user => <option key={user.id} value={user.id} disabled={user.status !== 'active'}>{user.name}{user.status !== 'active' ? ' (inactive)' : ''}</option>)}</select></label><label className="field"><span>Priority</span><select aria-label="Request priority" disabled={!editable || busy} value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as Draft['priority'] })}>{requestPriorities.map(priority => <option key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)}</option>)}</select></label></div>
                    <div className="request-images-heading"><h2>Images</h2>{editable && <Button variant="outline" type="button" disabled={busy} onClick={() => fileInput.current?.click()}><ImagePlus size={16}/>Add images</Button>}</div>
                    {editable && <><input ref={fileInput} type="file" className="sr-only" aria-label="Upload request images" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={busy} tabIndex={-1} onChange={event => { addImages(Array.from(event.target.files || [])); event.target.value = ''; }}/><p className="request-paste-hint">Paste a screenshot or add images.</p></>}
                    <div className="request-images">{current?.images.map(image => <figure key={image.id}><a href={image.url} target="_blank" rel="noopener noreferrer" aria-label={'Open image ' + image.name}><Image unoptimized width={1200} height={800} src={image.url} alt={image.name}/></a><figcaption><span>{image.name}</span>{editable && <Button type="button" variant="ghost" size="icon" disabled={busy} aria-label={'Remove image ' + image.name} onClick={() => void run(async () => { await responseData(await fetch(image.url, { method: 'DELETE' })); await load(); })}><Trash2 size={15}/></Button>}</figcaption></figure>)}{pending.map(image => <figure key={image.id}><Image unoptimized width={1200} height={800} src={image.url} alt={image.file.name}/><figcaption><span>{image.file.name}</span><Button type="button" variant="ghost" size="icon" disabled={busy} aria-label={'Remove pending image ' + image.file.name} onClick={() => { URL.revokeObjectURL(image.url); urls.current.delete(image.id); setPending(current => current.filter(p => p.id !== image.id)); }}><Trash2 size={15}/></Button></figcaption></figure>)}</div>
                    {error && <p className="submission-error" role="alert">{error}</p>}
                    {error.includes('another tab') && <Button type="button" variant="outline" disabled={busy} onClick={() => void run(async () => { const next = await load(), card = next.requests.find(c => c.id === draft.id); if (card) open(card); })}>Reload saved request</Button>}
                    <div className="request-editor-actions">{editable && draft.revision > 0 && <Button type="button" variant="ghost" disabled={busy} onClick={() => setArchiving(true)}>Archive request</Button>}<div><Button type="button" variant="outline" disabled={busy} onClick={() => { if (dirty) setDiscard(true); else close(); }}>{editable ? 'Cancel' : 'Close'}</Button>{editable && <Button type="submit" disabled={busy || !draft.title.trim()}>{busy ? 'Saving…' : 'Save request'}</Button>}</div></div>
                </form>}
            </DialogContent>
        </Dialog>
        <Dialog open={!!columns} onOpenChange={value => { if (!value && !busy) { setColumns(null); setError(''); } }}><DialogContent className="request-editor"><DialogHeader><DialogTitle>Edit columns</DialogTitle><DialogDescription className="sr-only">Rename, add or reorder the board columns.</DialogDescription></DialogHeader>{columns && <form onSubmit={event => { event.preventDefault(); void run(async () => { await post({ action: 'columns', revision: board?.revision || 0, columns }); setColumns(null); }); }}>{columns.map((column, index) => <div className="request-column-editor" key={column.id}><Input aria-label={'Column ' + (index + 1) + ' name'} required maxLength={60} disabled={busy} value={column.name} onChange={event => setColumns(columns.map(c => c.id === column.id ? { ...c, name: event.target.value } : c))}/><Button type="button" variant="outline" size="icon" aria-label={'Move column ' + (index + 1) + ' left'} disabled={busy || index === 0} onClick={() => { const next = [...columns]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setColumns(next); }}><ArrowLeft size={15}/></Button><Button type="button" variant="outline" size="icon" aria-label={'Move column ' + (index + 1) + ' right'} disabled={busy || index === columns.length - 1} onClick={() => { const next = [...columns]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; setColumns(next); }}><ArrowRight size={15}/></Button><Button type="button" variant="outline" size="icon" aria-label={'Remove column ' + (index + 1)} disabled={busy || columns.length === 1 || !!board?.requests.some(card => card.columnId === column.id)} onClick={() => setColumns(columns.filter(c => c.id !== column.id))}><Trash2 size={15}/></Button></div>)}<div className="request-editor-actions"><Button type="button" variant="outline" disabled={busy || columns.length >= 12} onClick={() => setColumns([...columns, { id: crypto.randomUUID(), name: '' }])}><Plus size={16}/>Add column</Button><Button type="submit" disabled={busy}>Save columns</Button></div>{error && <p className="submission-error" role="alert">{error}</p>}</form>}</DialogContent></Dialog>
        <AlertDialog open={discard || archiving} onOpenChange={value => { if (!value && !busy) { setDiscard(false); setArchiving(false); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{archiving ? 'Archive this request?' : 'Discard unsaved changes?'}</AlertDialogTitle><AlertDialogDescription>{archiving ? 'It will be removed from the board.' : 'Your unsaved details and pasted images will be discarded.'}</AlertDialogDescription></AlertDialogHeader>{archiving && error && <p className="submission-error" role="alert">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep editing</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); if (archiving && draft) void run(async () => { await post({ action: 'archive', id: draft.id, revision: draft.revision }); close(); }); else close(); }}>{archiving ? 'Archive request' : 'Discard changes'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </section>;
}
