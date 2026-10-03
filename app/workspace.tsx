'use client';
import { cloneElement, isValidElement, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Accounts from './accounts';
import Requests from './requests';
import TenantSwitcher, { type Business } from './tenant-switcher';
import { canEdit, roleLabels, type WorkspaceRole } from '@/lib/permissions';
import { LayoutGrid, Users, Library, Plus, Clock, Check, Keyboard, SpellCheck, MessageSquare, Brain, ChevronUp, ChevronDown, Copy, ExternalLink, FileText, Search, RefreshCw, Trash2, CheckCircle2, Download, ShieldCheck, Kanban, ChartNoAxesCombined } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Assessment, Attempt, TestModule, ModuleKind, Question, Review, kindLabels, copyModule, blankModule, blankQuestion, blankCriterion, customModuleKinds, SavedModule, formatTime, rubric, validateAssessment, reviewCriteria, workDuration, AssessmentConfig, Criterion, withTypingAdministration, typingSeconds, canFinishTypingEarly, sectionDuration } from '@/lib/assessment';
const icons = { questions: FileText, spelling: SpellCheck, grammar: FileText, typing: Keyboard, problem: Brain, writing: MessageSquare };
const kinds = Object.keys(kindLabels).filter(k => k !== 'questions') as ModuleKind[];
const Analytics = dynamic(() => import('./analytics'), { loading: () => <Skeleton className="h-72 w-full"/> });
const nav = [{ id: 'tests', title: 'Assessments', icon: LayoutGrid }, { id: 'candidates', title: 'Candidate review', icon: Users }, { id: 'library', title: 'Module library', icon: Library }, { id: 'analytics', title: 'Analytics', icon: ChartNoAxesCombined }, { id: 'requests', title: 'Requests', icon: Kanban }, { id: 'accounts', title: 'Accounts & permissions', icon: ShieldCheck }];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const fmtDate = (n: number) => new Date(n).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const awaitingWritingReview = (attempt: Attempt) => attempt.status === 'completed' && !attempt.review && attempt.modules.some(module => module.kind === 'writing');
async function sendRequest(body: unknown, tenantId: string) { const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId }, body: JSON.stringify(body) }); const data = await r.json() as {
    error: string;
    id: string;
    path: string;
}; if (!r.ok)
    throw new Error(data.error || 'Unable to save.'); return data; }
function ModuleIcon({ kind }: {
    kind: ModuleKind;
}) { const Icon = icons[kind]; return <span className={`module-icon kind-${kind}`}><Icon size={20}/></span>; }
function Status({ value }: {
    value: string;
}) { return <span className={`status status-${value}`}>{value === 'ready' ? 'Ready' : value === 'draft' ? 'Draft' : value === 'completed' ? 'Submitted' : value === 'in-progress' ? 'In progress' : value === 'not-started' ? 'Not started' : value === 'follow-up' ? 'Follow-up' : value === 'awaiting' ? 'Awaiting review' : value === 'not-scorable' ? 'Not scorable' : 'Reviewed'}</span>; }
function Field({ label, help, children }: {
    label: string;
    help?: string;
    children: React.ReactNode;
}) { return <label className="field"><span>{label}</span>{isValidElement(children) ? cloneElement(children as React.ReactElement<{ "aria-label"?: string }>, { "aria-label": label }) : children}{help && <small>{help}</small>}</label>; }
function ChoiceSelect({ value, onChange, options, label }: {
    value: string;
    onChange: (v: string) => void;
    options: {
        value: string;
        label: string;
    }[];
    label: string;
}) { return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="select-field"><SelectValue /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>; }
export default function Admin({ tenantId, tenantName, isGlobalAdmin, businesses }: { tenantId: string; tenantName: string; isGlobalAdmin: boolean; businesses: Business[] }) {
    const request = (body: unknown) => sendRequest(body, tenantId);
    const [page, setPage] = useState('tests');
    const [presets, setPresets] = useState<TestModule[]>([]);
    const template = (kind: ModuleKind) => copyModule(presets.find(m => m.kind === kind)!);
    const [library, setLibrary] = useState<SavedModule[]>([]);
    const [libraryEdit, setLibraryEdit] = useState<{ id: string; revision: number } | null>(null);
    const [createModule, setCreateModule] = useState(false);
    const [tests, setTests] = useState<Assessment[]>([]);
    const [attempts, setAttempts] = useState<Attempt[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const [user, setUser] = useState('');
    const [role, setRole] = useState<WorkspaceRole>('viewer');
    const editable = canEdit(role);
    const [inspecting, setInspecting] = useState<Assessment | null>(null);
    const [editing, setEditing] = useState<Assessment | null>(null);
    const [initial, setInitial] = useState('');
    const [discard, setDiscard] = useState(false);
    const [busy, setBusy] = useState(false);
    const [create, setCreate] = useState(false);
    const [linkTest, setLinkTest] = useState<Assessment | null>(null);
    const [alias, setAlias] = useState('');
    const [link, setLink] = useState('');
    const [extraSeconds, setExtraSeconds] = useState(0);
    const [active, setActive] = useState<Attempt | null>(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const load = useCallback(async () => { try {
        const r = await fetch('/api/admin', { headers: { 'X-Tenant-Id': tenantId } });
        const d = await r.json() as {
            error: string;
            presets: TestModule[];
            library: SavedModule[];
            assessments: Assessment[];
            attempts: Attempt[];
            user: string;
            role: WorkspaceRole;
        };
        if (!r.ok)
            throw new Error(d.error);
        setPresets(d.presets);
        setLibrary(d.library);
        setTests(d.assessments);
        setAttempts(d.attempts);
        setActive(current => current ? d.attempts.find(a => a.id === current.id) || null : null);
        setUser(d.user);
        setRole(d.role);
        if (!canEdit(d.role)) setEditing(null);
        if (d.role !== 'admin') setPage(current => current === 'accounts' ? 'tests' : current);
        setError('');
        setLoaded(true);
        return d;
    }
    catch (e) {
        setError((e as Error).message);
        setLoaded(true);
        return null;
    } }, [tenantId]);
    useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
    useEffect(() => { if (!editing)
        return; const handler = (e: BeforeUnloadEvent) => { if (JSON.stringify(editing) !== initial) {
        e.preventDefault();
    } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [editing, initial]);
    useEffect(() => { const model = (document as unknown as {
        modelContext?: {
            registerTool: (t: unknown, o: unknown) => void;
        };
    }).modelContext; if (!model)
        return; const controller = new AbortController(); model.registerTool({ name: 'read_assessment_workspace', title: 'Read assessment workspace', description: 'Read the loaded assessment titles, time budgets and candidate review counts. This does not modify anything.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: (input: unknown) => { if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw new Error('Expected an empty object.'); return { assessments: tests.map(t => ({ id: t.id, title: t.title, status: t.status, seconds: workDuration(t) })), submitted: attempts.filter(a => a.status === 'completed').length, awaitingReview: attempts.filter(awaitingWritingReview).length }; } }, { signal: controller.signal }); return () => controller.abort(); }, [tests, attempts]);
    const openEdit = (t: Assessment) => { setLibraryEdit(null); const v = clone(t); if (!v.id && !v.config) v.config = {...{flexible:true,workSeconds:600,introductionSeconds:0,code:'',supportEmail:'',spellCheck:true,toolPolicy:'',notice:''},...withTypingAdministration(v).config,oneQuestionAtATime:true,allowBackNavigation:false}; setEditing(v); setInitial(JSON.stringify(v)); };
    const leaveEdit = () => { if (editing && JSON.stringify(editing) !== initial)
        setDiscard(true);
    else
        setEditing(null); };
    const run = async (fn: () => Promise<unknown>) => { if (busy)
        return; setBusy(true); try {
        await fn();
    }
    catch (e) {
        toast.error((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    const editModule = (m: TestModule, record?: SavedModule) => {
        const a: Assessment = { id: '', title: m.title, description: '', status: 'ready', modules: [clone(m)], updatedAt: 0, revision: 0 };
        openEdit(a); setLibraryEdit({ id: record?.id || '', revision: record?.revision || 0 }); setPage('library');
    };
    const save = (status: 'draft' | 'ready') => run(async () => {
        if (!editing) return;
        if (libraryEdit) {
            await request({ action: 'save-module', id: libraryEdit.id, revision: libraryEdit.revision, module: editing.modules[0] });
            await load(); setEditing(null); setLibraryEdit(null); toast.success('Module saved.'); return;
        }
        const a = { ...editing, status }; const err = validateAssessment(a, status === 'ready');
        if (err) throw new Error(err);
        await request({ action: 'save', assessment: a }); await load(); setEditing(null); setPage('tests'); toast.success(status === 'ready' ? 'Assessment ready.' : 'Draft saved.');
    });
    const preview = (t: Assessment) => run(async () => {
        const d = await request({ action: 'preview', id: t.id }); window.location.assign(d.path);
    });
    const candidateLink = (t: Assessment) => { setLinkTest(t); setLink(''); setAlias(''); setExtraSeconds(0); };
    const createLink = () => run(async () => {
        if (!linkTest) return;
        const d = await request({ action: 'link', id: linkTest.id, alias, ...(linkTest.config?.flexible ? { extraSeconds } : {}) }); setLink(window.location.origin + d.path); await load(); toast.success('Candidate link created.');
    });
    const copy = async () => { try {
        await navigator.clipboard.writeText(link);
        toast.success('Link copied.');
    }
    catch {
        toast.error('Select the link and copy it manually.');
    } };
    const coreTemplate = tests.find(t=>t.config?.code?.startsWith('RES-CS-CORE'));
    const pending = attempts.filter(awaitingWritingReview).length;
    const visible = attempts.filter(a => (a.alias + ' ' + a.title).toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'pending' ? awaitingWritingReview(a) : filter === 'reviewed' ? !!a.review : a.status !== 'completed')));
    const candidates = (rows: Attempt[]) => <Table><TableHeader><TableRow><TableHead>Candidate</TableHead><TableHead>Assessment</TableHead><TableHead>Objective score</TableHead><TableHead>Writing review</TableHead><TableHead>Date</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{rows.map(a => <TableRow key={a.id}><TableCell><div className="candidate-cell"><span className="avatar">{a.alias.split(' ').map(s => s[0]).slice(0, 2).join('')}</span><div><strong>{a.alias}</strong>{a.revoked && <small>Link revoked</small>}</div></div></TableCell><TableCell>{a.title}</TableCell><TableCell data-label="Objective score">{a.result?.objective != null ? <span className="score-inline">{a.result.decisions ? `${a.result.objectiveCorrect} of ${a.result.objectiveTotal}` : a.result.objective}<small>{a.result.decisions ? ' correct' : '/100'}</small></span> : <Status value={a.status}/>}</TableCell><TableCell data-label="Writing review">{a.status !== 'completed' ? <span className="muted">—</span> : a.review ? <Status value={a.review.outcome}/> : a.modules.some(module => module.kind === 'writing') ? <span className="awaiting">Awaiting review</span> : <span className="muted">Not required</span>}</TableCell><TableCell>{fmtDate(a.completedAt || a.createdAt)}</TableCell><TableCell><Button variant="outline" onClick={() => setActive(a)} aria-label={`Review ${a.alias}`}>{a.status === 'completed' ? 'Review' : 'View'}</Button>{editable && a.status !== 'completed' && !a.revoked && <Button variant="ghost" disabled={busy} aria-label={`Revoke link for ${a.alias}`} onClick={() => run(async () => { await request({ action: 'revoke', id: a.id, revision: a.revision }); await load(); toast.success('Candidate link revoked.'); })}>Revoke link</Button>}</TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={6}><div className="empty-block">No candidates match this view</div></TableCell></TableRow>}</TableBody></Table>;
    return <SidebarProvider><Sidebar className="assess-sidebar"><SidebarHeader><Link className="brand" href="/" prefetch={false} onClick={e => { if (editing) {
        e.preventDefault();
        leaveEdit();
    } }} aria-label="Resolvable Assess home"><span className="brand-symbol">r</span><div><strong>resolvable</strong><small>Assess</small></div></Link>{isGlobalAdmin ? <TenantSwitcher current={tenantId} businesses={businesses}/> : <p>{tenantName}</p>}</SidebarHeader><SidebarContent><SidebarMenu>{nav.filter(n => n.id !== 'accounts' || role === 'admin').map(n => <SidebarMenuItem key={n.id}><SidebarMenuButton isActive={page === n.id && !editing} onClick={() => { if (editing) {
        leaveEdit();
        return;
    } setPage(n.id); }} className="nav-item"><n.icon /><span>{n.title}</span>{n.id === 'candidates' && pending > 0 && <span className="nav-count">{pending}</span>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter><div className="sidebar-user"><span className="avatar">R</span><div><strong>{isGlobalAdmin ? 'Global admin' : roleLabels[role]}</strong><small>{user || 'Team member'}</small></div></div><form action="/auth/signout" method="post"><Button variant="ghost" type="submit">Sign out</Button></form></SidebarFooter></Sidebar><SidebarInset className="app-main"><header className="topbar"><Link href="/" prefetch={false} className="mobile-brand" aria-label="Resolvable Assess home" onClick={e=>{if(editing){e.preventDefault();leaveEdit();}}}>resolvable</Link><SidebarTrigger /></header><main className="main-content">
 {error && <div className="error-panel" role="alert"><strong>Couldn’t load the workspace</strong><p>{error}</p><Button onClick={() => void load()} variant="outline"><RefreshCw size={16}/>Retry</Button></div>}
 {!loaded ? <div className="loading-grid"><Skeleton className="h-12 w-72"/><Skeleton className="h-64 w-full"/></div> : editing ? <Builder key={initial} presets={presets} library={library} moduleOnly={!!libraryEdit} assessment={editing} setAssessment={setEditing} onClose={leaveEdit} onSave={save} busy={busy}/> : <>
 {page === 'accounts' && role === 'admin' && <Accounts tenantId={tenantId}/>}
 {page === 'requests' && <Requests key={tenantId}/>}
 {page === 'analytics' && <Analytics key={tenantId} tenantId={tenantId} onReview={() => { setPage('candidates'); setQuery(''); setFilter('all'); }} onRequests={() => setPage('requests')}/>}
 {role === 'viewer' && page !== 'requests' && page !== 'analytics' && <div className="mini-notice">Viewer access: you can read assessments, modules and candidate results.</div>}
 {page === 'tests' && <><div className="page-heading"><div><h1>Assessments</h1></div>{editable && <Button className="primary-action" onClick={() => setCreate(true)}><Plus />Create assessment</Button>}</div>
 {!tests.length ? <section className="start-panel"><h2>No assessments yet</h2></section> : <div className={`assessments-list ${editable ? '' : 'assessments-readonly'}`}><Table className="assessment-table" aria-label="Assessments"><TableHeader><TableRow>
    <TableHead scope="col">Assessment</TableHead><TableHead scope="col" className="assessment-duration-heading">Duration</TableHead><TableHead scope="col" className="assessment-modules-heading">Modules</TableHead><TableHead scope="col" className="assessment-actions-heading"><span className="sr-only">Actions</span></TableHead>
 </TableRow></TableHeader><TableBody>{tests.map(t => <TableRow key={t.id}>
    <th scope="row" className="assessment-name"><span>{t.title}</span>{t.status === 'draft' && <Status value="draft"/>}</th>
    <TableCell className="assessment-duration" data-label="Duration">{formatTime(workDuration(t))}</TableCell><TableCell className="assessment-modules" data-label="Modules">{t.modules.length}</TableCell>
    <TableCell className="assessment-actions"><div>{editable ? <><Button className="candidate-link-action" disabled={t.status !== 'ready'} onClick={() => candidateLink(t)}>Create candidate link</Button><Button variant="outline" disabled={busy || t.status !== 'ready'} onClick={() => preview(t)}>Preview test</Button><Button variant="outline" aria-label="Edit assessment" onClick={() => openEdit(t)}>Edit</Button></> : <Button variant="outline" onClick={() => setInspecting(t)}>View assessment</Button>}</div></TableCell>
 </TableRow>)}</TableBody></Table></div>}

 </>}
 {page === 'candidates' && <><div className="page-heading"><div><h1>Candidate review</h1></div><Button variant="outline" onClick={() => void load()}><RefreshCw size={16}/>Refresh</Button></div><div className="filter-bar"><div className="search-field"><Search size={18}/><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a candidate or assessment" aria-label="Search candidates"/></div><ChoiceSelect label="Review status" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All candidates' }, { value: 'pending', label: 'Awaiting review' }, { value: 'reviewed', label: 'Reviewed' }, { value: 'active', label: 'Not submitted' }]}/></div><div className="table-panel">{candidates(visible)}</div></>}
 {page === 'library' && <><div className="page-heading"><div><h1>Module library</h1></div>{editable && <Button onClick={() => setCreateModule(true)}><Plus />Create module</Button>}</div>
 {!library.length && <section className="start-panel"><h2>No modules yet</h2></section>}
 <div className="library-grid">{library.map(record => <article className="library-card" key={record.id}>
    <h2>{record.module.title}</h2><div className="library-meta"><span>{kindLabels[record.module.kind]}</span><span>{formatTime(record.module.kind === 'typing' ? typingSeconds(record.module) : record.module.seconds)}</span>{record.module.questions && <span>{record.module.questions.length} {record.module.questions.length === 1 ? 'question' : 'questions'}</span>}</div>
    <div className="button-row">{editable ? <><Button variant="outline" onClick={() => editModule(record.module, record)}>Edit module</Button><Button onClick={() => openEdit({ id: '', title: `${record.module.title} assessment`, description: '', status: 'draft', modules: [copyModule(record.module)], updatedAt: Date.now(), revision: 0 })}>Build assessment</Button></> : <Button variant="outline" onClick={() => setInspecting({ id: record.id, title: record.module.title, description: '', status: 'ready', modules: [record.module], updatedAt: record.updatedAt, revision: record.revision })}>View module</Button>}</div>
</article>)}</div></>}

 </>}
 </main></SidebarInset>
 <Dialog open={!!inspecting} onOpenChange={value => { if (!value) setInspecting(null); }}><DialogContent className="module-dialog assessment-details"><DialogHeader><DialogTitle>{inspecting?.title}</DialogTitle><DialogDescription>{inspecting?.description || 'Saved assessment content'} · {inspecting ? formatTime(workDuration(inspecting)) : ''}</DialogDescription></DialogHeader>{inspecting?.modules.map(module => <section className="module-preview" key={module.id}><h2>{module.title}</h2><p>{module.instructions}</p>{module.context && <pre className="policy-card">{module.context}</pre>}{module.questions?.map(question => <div className="preview-question" key={question.id}><h3>{question.prompt}</h3><ol>{question.options.map((option, index) => <li key={index}>{option}{index === question.correct ? ' (answer key)' : ''}</li>)}</ol><p>{question.explanation}</p></div>)}{module.passage && <div className="typing-passage">{module.passage}</div>}{module.prompt && <p>{module.prompt}</p>}</section>)}</DialogContent></Dialog>
 <Dialog open={create} onOpenChange={setCreate}><DialogContent className="create-dialog"><DialogHeader><DialogTitle>Create an assessment</DialogTitle><DialogDescription className="sr-only">Choose a starting point.</DialogDescription></DialogHeader><>{coreTemplate && <button className="creation-option" onClick={()=>{openEdit({...clone(coreTemplate),id:'',revision:0,status:'draft',modules:coreTemplate.modules.map(copyModule)});setCreate(false);}}><span className="test-glyph"><MessageSquare/></span><div><strong>{coreTemplate.title}</strong><small>{formatTime(workDuration(coreTemplate))} · {coreTemplate.modules.length} modules</small></div></button>}</>{!coreTemplate && <button className="creation-option" onClick={() => { const a: Assessment = { id: '', title: 'Customer support essentials', description: 'A short, practical work sample for written customer-service roles.', status: 'draft', modules: kinds.map(template), updatedAt: Date.now(), revision: 0 }; openEdit(a); setCreate(false); }}><span className="test-glyph"><MessageSquare /></span><div><strong>Customer support essentials</strong><small>{formatTime(presets.reduce((total,m)=>total+m.seconds,0))} · {kinds.length} modules</small></div></button>}<button className="creation-option" onClick={() => { openEdit({ id: '', title: 'Untitled assessment', description: '', status: 'draft', modules: [], updatedAt: Date.now(), revision: 0 }); setCreate(false); }}><span className="test-glyph"><Plus /></span><div><strong>Start from scratch</strong></div></button></DialogContent></Dialog>
 <Dialog open={createModule} onOpenChange={setCreateModule}><DialogContent className="module-dialog"><DialogHeader><DialogTitle>Create a module</DialogTitle><DialogDescription className="sr-only">Choose a module type.</DialogDescription></DialogHeader><ModuleTypePicker onChoose={kind => { editModule(blankModule(kind)); setCreateModule(false); }}/></DialogContent></Dialog>
 <Dialog open={!!linkTest} onOpenChange={v => { if (!v) setLinkTest(null); }}><DialogContent><DialogHeader><DialogTitle>Create candidate link</DialogTitle><DialogDescription>{linkTest?.title} · {linkTest ? formatTime(workDuration(linkTest)) : ''}</DialogDescription></DialogHeader>{!link ? <><Field label="Candidate name or reference"><Input value={alias} maxLength={80} onChange={e => setAlias(e.target.value)}/></Field><>{linkTest?.config?.flexible && <Field label="Agreed extra time (seconds)"><Input type="number" min={0} max={86400} value={extraSeconds} onChange={e=>setExtraSeconds(Number(e.target.value))}/></Field>}</><Button disabled={busy || !alias.trim()} onClick={createLink}>Create candidate link</Button></> : <><Field label="Candidate assessment link"><Input value={link} readOnly onFocus={e => e.target.select()}/></Field><div className="button-row"><Button variant="outline" onClick={copy}><Copy size={16}/>Copy link</Button><Button asChild><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Open candidate view</a></Button></div></>}</DialogContent></Dialog>
 <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription>Unsaved changes will be lost.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => { setEditing(null); setDiscard(false); }}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <Sheet open={!!active} onOpenChange={v => { if (!v)
        setActive(null); }}><SheetContent className="review-sheet"><SheetHeader><SheetTitle>{active?.alias}</SheetTitle><SheetDescription>{active?.title}</SheetDescription></SheetHeader>{active && <ReviewPanel key={active.id} attempt={active} readOnly={!editable} busy={busy} onSave={review => run(async () => { await request({ action: 'review', id: active.id, revision: active.revision, review }); const d = await load(); if (d)
        setActive(d.attempts.find((a: Attempt) => a.id === active.id) || null); toast.success('Review saved.'); })}/>}</SheetContent></Sheet><Toaster position="bottom-right"/></SidebarProvider>;
}
function ModuleTypePicker({onChoose}: {onChoose:(kind: typeof customModuleKinds[number])=>void}) {
    return <div className="module-type-picker">{customModuleKinds.map(kind=><Button key={kind} variant="outline" onClick={()=>onChoose(kind)}><ModuleIcon kind={kind}/>{kindLabels[kind]}</Button>)}</div>;
}
function Builder({ assessment: a, setAssessment, onClose, onSave, busy, library, presets, moduleOnly }: {
    library: SavedModule[];
    presets: TestModule[];
    moduleOnly: boolean;
    assessment: Assessment;
    setAssessment: (a: Assessment) => void;
    onClose: () => void;
    onSave: (s: 'draft' | 'ready') => void;
    busy: boolean;
}) {
    const template = (kind: ModuleKind) => copyModule(presets.find(m => m.kind === kind)!);
    const [selected, setSelected] = useState(a.modules[0]?.id || '');
    const [adding, setAdding] = useState(false);
    const [remove, setRemove] = useState('');
    const [builderTab, setBuilderTab] = useState('edit');
    const active = a.modules.find(m => m.id === selected);
    const total = workDuration(a);
    const update = (patch: Partial<Assessment>) => setAssessment(moduleOnly ? { ...a, ...patch } : withTypingAdministration({ ...a, ...patch }));
    const change = (patch: Partial<TestModule>) => active && update({ modules: a.modules.map(m => m.id === active.id ? { ...m, ...patch } : m) });
    const add = (kind: ModuleKind, blank = false) => {
        const m = blank ? blankModule(kind) : template(kind);
        update({ modules: [...a.modules, m] }); setSelected(m.id); setBuilderTab('edit'); setAdding(false);
    };
    const move = (id: string, delta: number) => { const mods = [...a.modules]; const i = mods.findIndex(m => m.id === id); if (i + delta < 0 || i + delta >= mods.length)
        return; [mods[i], mods[i + delta]] = [mods[i + delta], mods[i]]; update({ modules: mods }); };
    const qChange = (id: string, patch: Partial<Question>) => change({ questions: active?.questions?.map(q => {
        if(q.id!==id)return q;
        const optionIds=patch.options && q.optionIds && patch.options.length!==q.options.length ? patch.options.map(o=>q.options.includes(o)?q.optionIds![q.options.indexOf(o)]:crypto.randomUUID()) : q.optionIds;
        return {...q,...patch,optionIds,...(patch.correct!==undefined && optionIds ? {correctOptionId:optionIds[patch.correct]} : {})};
    }) });
    return <><div className="page-heading builder-heading"><div><button className="text-button" onClick={onClose}>{moduleOnly ? 'Back to module library' : 'Back to assessments'}</button><h1>{moduleOnly ? 'Module editor' : 'Assessment builder'}</h1></div><div className="button-row"><Button variant="outline" onClick={() => onSave('draft')} disabled={busy || moduleOnly} hidden={moduleOnly}>Save draft</Button><Button onClick={() => onSave('ready')} disabled={busy}>{moduleOnly ? 'Save module' : 'Save & mark ready'}</Button></div></div><div className="builder-basics" hidden={moduleOnly}><Field label="Assessment title"><Input value={a.title} maxLength={120} onChange={e => update({ title: e.target.value })}/></Field><Field label="Candidate introduction"><Input value={a.description} maxLength={1000} onChange={e => update({ description: e.target.value })} placeholder="A short explanation of what this test covers"/></Field>{!moduleOnly && <AssessmentSettings config={a.config} onChange={config=>update({config})}/>}</div><div className={`builder-layout${moduleOnly ? ' module-only' : ''}`}>{!moduleOnly && <section className="builder-outline"><div className="outline-heading"><strong>Test modules</strong><span>{a.modules.length}</span></div><div className="budget"><div><span>Timed work</span><strong>{formatTime(total)}</strong></div></div><ol className="module-list">{a.modules.map((m, i) => <li className={selected === m.id ? 'selected' : ''} key={m.id}><button className="module-select" onClick={() => setSelected(m.id)}><span className="module-number">{i + 1}</span><ModuleIcon kind={m.kind}/><div><strong>{m.title || 'Untitled module'}</strong><small>{formatTime(a.config?.flexible ? m.seconds : sectionDuration(m))} · {m.kind === 'writing' ? 'Human review' : 'Auto-scored'}</small></div></button><div className="module-order"><button disabled={i === 0} onClick={() => move(m.id, -1)} aria-label={`Move ${m.title} up`}><ChevronUp size={16}/></button><button disabled={i === a.modules.length - 1} onClick={() => move(m.id, 1)} aria-label={`Move ${m.title} down`}><ChevronDown size={16}/></button></div></li>)}</ol><Button variant="outline" className="add-module" disabled={moduleOnly || a.modules.length >= 12} onClick={() => setAdding(true)}><Plus size={18}/>Add module</Button></section>}<section className="builder-editor">{!active ? <div className="empty-editor"><h2>No modules added</h2></div> : <><div className="editor-heading"><ModuleIcon kind={active.kind}/><div><h2>{kindLabels[active.kind]}</h2></div><Button variant="ghost" size="icon" hidden={moduleOnly} aria-label={`Remove ${active.title}`} onClick={() => setRemove(active.id)}><Trash2 size={18}/></Button></div><Tabs value={builderTab} onValueChange={setBuilderTab}><TabsList variant="line" className="editor-tabs"><TabsTrigger value="edit">Edit content</TabsTrigger><TabsTrigger value="preview">Candidate preview</TabsTrigger><TabsTrigger value="scoring">Scoring method</TabsTrigger></TabsList><TabsContent value="edit"><div className="edit-fields"><div className="two-fields"><Field label="Module title"><Input value={active.title} maxLength={120} onChange={e => change({ title: e.target.value })}/></Field><Field label="Time limit (seconds)"><Input type="number" min={15} max={86400} value={active.seconds} onChange={e => change({ seconds: Number(e.target.value) })}/></Field></div><Field label="Candidate instructions"><Textarea value={active.instructions} maxLength={2000} onChange={e => change({ instructions: e.target.value })}/></Field>
 {active.kind !== 'typing' && <Field label="Policy / reference material"><Textarea rows={6} maxLength={8000} value={active.context || ''} onChange={e => change({ context: e.target.value })}/></Field>}
 {active.questions && <label><input type="checkbox" checked={!!active.sequential} onChange={e=>change({sequential:e.target.checked})}/> Reveal developing-case questions in order</label>}{active.questions?.map((q, i) => <div className="question-editor" key={q.id}><div className="question-heading"><strong>Question {i + 1}</strong>{(active.questions?.length || 0) > 1 && <Button variant="ghost" size="icon" aria-label={`Delete question ${i + 1}`} onClick={() => change({ questions: active.questions?.filter(v => v.id !== q.id) })}><Trash2 size={16}/></Button>}</div><Field label="Case facts for this question"><Textarea rows={4} value={q.context || ''} maxLength={4000} onChange={e=>qChange(q.id,{context:e.target.value})}/></Field><Field label="Question"><Textarea value={q.prompt} maxLength={1500} onChange={e => qChange(q.id, { prompt: e.target.value })}/></Field><div className="options-editor"><span>Answer options · select the correct answer</span><RadioGroup value={String(q.correct)} onValueChange={v => qChange(q.id, { correct: Number(v) })} aria-label={`Correct answer for question ${i + 1}`}>{q.options.map((o, idx) => <div className="option-edit" key={idx}><RadioGroupItem id={`${q.id}-${idx}`} value={String(idx)}/><label className="sr-only" htmlFor={`${q.id}-${idx}`}>Option {idx + 1} is correct</label><Input aria-label={`Question ${i + 1}, option ${idx + 1}`} value={o} maxLength={1000} onChange={e => qChange(q.id, { options: q.options.map((v, n) => n === idx ? e.target.value : v) })}/>{q.options.length > 2 && <button aria-label={`Remove option ${idx + 1}`} onClick={() => qChange(q.id, { options: q.options.filter((_, n) => n !== idx), correct: q.correct === idx ? 0 : q.correct > idx ? q.correct - 1 : q.correct })}><Trash2 size={15}/></button>}</div>)}</RadioGroup>{q.options.length < 5 && <button className="text-button" onClick={() => qChange(q.id, { options: [...q.options, ''] })}>Add answer option</button>}</div><Field label="Answer explanation"><Textarea value={q.explanation} maxLength={2000} onChange={e => qChange(q.id, { explanation: e.target.value })}/></Field></div>)}
 {active.questions && (active.questions.length < 8) && <Button variant="outline" onClick={() => change({ questions: [...active.questions!, blankQuestion()] })}><Plus size={17}/>Add a question from scratch</Button>}
 {active.kind === 'typing' && <><Field label="Typing passage"><Textarea rows={10} maxLength={5000} value={active.passage || ''} onChange={e => change({ passage: e.target.value })}/></Field><Field label="Practice text"><Textarea value={active.practice||''} maxLength={2000} onChange={e=>change({practice:e.target.value})}/></Field><Field label="Typing measurement"><ChoiceSelect label="Typing measurement" value={active.typingMode || 'legacy'} onChange={v=>change({typingMode:v==='prefix-v1'?'prefix-v1':undefined})} options={[{value:'prefix-v1',label:'Separate speed and accuracy'},{value:'legacy',label:'Legacy target score'}]}/></Field><Field label="Typing duration (seconds)"><Input type="number" min={15} max={86400} value={typingSeconds(active)} onChange={e=>change({typingSeconds:Number(e.target.value)})}/></Field><label><input type="checkbox" checked={canFinishTypingEarly(active)} onChange={e=>change({finishTypingEarly:e.target.checked})}/> Allow early finish when the full passage is correct</label><label><input type="checkbox" checked={!!active.allowPaste} onChange={e=>change({allowPaste:e.target.checked})}/> Allow pasting into the typing response</label>{active.typingMode !== 'prefix-v1' && <Field label="Reference typing target (WPM)"><Input type="number" min={1} max={200} value={active.targetWpm || 45} onChange={e => change({ targetWpm: Number(e.target.value) })}/></Field>}</>}
 {active.kind === 'writing' && <><Field label="Writing prompt"><Textarea rows={4} maxLength={4000} value={active.prompt || ''} onChange={e => change({ prompt: e.target.value })}/></Field><RubricEditor key={active.id} module={active} onChange={change}/></>}
 </div></TabsContent><TabsContent value="preview"><div className="module-preview"><h2>{active.title}</h2><p>{active.instructions}</p>{active.context && <pre className="policy-card">{active.context}</pre>}{active.questions?.map((q, i) => <div className="preview-question" key={q.id}><h3>{i + 1}. {q.prompt || 'Your question will appear here'}</h3>{q.context && <pre className="policy-card">{q.context}</pre>}{q.options.map((o, n) => <div className="preview-option" key={n}><span>{String.fromCharCode(65 + n)}</span>{o || 'Answer option'}</div>)}</div>)}{active.passage && <div className="typing-passage">{active.passage}</div>}{active.prompt && <><p><strong>{active.prompt}</strong></p><Textarea placeholder="Candidate writes their reply here" disabled rows={6}/></>}</div></TabsContent><TabsContent value="scoring"><div className="scoring-method"><h2>Scoring</h2>{active.kind === 'typing' && active.typingMode === 'prefix-v1' ? <><p>Final-text WPM, correct-character WPM and accuracy are reported separately.</p><p>{typingSeconds(active)}-second sample.</p></> : active.kind === 'typing' ? <><p>Corrected characters are calculated by edit distance against the matching prefix of the reference passage. Errors include substitutions, insertions and omissions in that prefix.</p><dl><dt>Gross WPM</dt><dd>Typed characters ÷ 5 ÷ sample minutes</dd><dt>Net WPM</dt><dd>(Typed characters − errors) ÷ 5 ÷ sample minutes</dd><dt>Accuracy</dt><dd>Corrected characters ÷ typed characters × 100</dd><dt>Module score</dt><dd>Net WPM ÷ {active.targetWpm || 45} target WPM × 100, capped at 100</dd></dl><p>{typingSeconds(active)}-second sample.</p></> : active.kind === 'writing' && active.rubric ? <>{active.rubric.map(r=><div className="rubric-description" key={r.id}><strong>{r.title}</strong><p>{r.help}</p>{r.anchors.map((anchor,n)=><p key={n}>{n}: {anchor}</p>)}</div>)}</> : active.kind === 'writing' ? <><p>Four criteria, each rated 0–4 by a reviewer. The reply and notes remain visible beside the rating.</p>{rubric.map(r => <div className="rubric-description" key={r.id}><strong>{r.title}</strong><p>{r.help}</p><small>0: {r.anchors[0]} · 2: {r.anchors[1]} · 4: {r.anchors[2]}</small></div>)}</> : <><p>One point for each correct choice, zero for an incorrect or unanswered question. The module score is correct answers ÷ total questions × 100.</p></>}</div></TabsContent></Tabs></>}</section></div>
 <Dialog open={adding} onOpenChange={setAdding}><DialogContent className="module-dialog"><DialogHeader><DialogTitle>Add a module</DialogTitle><DialogDescription className="sr-only">Choose a saved module or create your own.</DialogDescription></DialogHeader><h3>Create new</h3><ModuleTypePicker onChoose={kind => add(kind, true)}/><h3>Saved modules</h3>{!library.length && <p>No saved modules</p>}<div className="add-module-grid">{library.map(record => <Button key={record.id} variant="outline" onClick={() => { const m = copyModule(record.module); update({ modules: [...a.modules, m] }); setSelected(m.id); setAdding(false); }}>{record.module.title} · {formatTime(record.module.seconds)}</Button>)}</div><details className="module-presets"><summary>Use a preset</summary><div className="add-module-grid">{kinds.map(k => <div className="add-module-choice" key={k}><ModuleIcon kind={k}/><div><strong>{kindLabels[k]}</strong><small>{formatTime(template(k).seconds)} suggested</small></div><Button variant="outline" onClick={() => add(k)}>Use preset</Button></div>)}</div></details></DialogContent></Dialog>
 <AlertDialog open={!!remove} onOpenChange={v => { if (!v)
        setRemove(''); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this module?</AlertDialogTitle><AlertDialogDescription>This changes the unsaved test only.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep module</AlertDialogCancel><AlertDialogAction onClick={() => { const mods = a.modules.filter(m => m.id !== remove); update({ modules: mods }); if (selected === remove)
        setSelected(mods[0]?.id || ''); setRemove(''); }}>Remove module</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
function AssessmentSettings({config, onChange}: {config?:AssessmentConfig;onChange:(config?:AssessmentConfig)=>void}) {
    const defaults: AssessmentConfig = {flexible:false,workSeconds:600,introductionSeconds:0,code:'',supportEmail:'',spellCheck:true,toolPolicy:'',notice:''};
    const settings = {...defaults,...config};
    const change=(patch:Partial<AssessmentConfig>)=>onChange({...settings,...patch});
    return <section className="administration-settings"><Field label="Candidate timing"><ChoiceSelect label="Candidate timing" value={settings.flexible?'shared':'sections'} onChange={v=>change({flexible:v==='shared'})} options={[{value:'shared',label:'Shared work timer'},{value:'sections',label:'Separate section timers'}]}/></Field>{settings.flexible&&<div className="two-fields"><Field label="Work timer (seconds)"><Input type="number" min={15} max={86400} value={settings.workSeconds} onChange={e=>change({workSeconds:Number(e.target.value)})}/></Field><Field label="Planned introduction (seconds)"><Input type="number" min={0} max={86400} value={settings.introductionSeconds} onChange={e=>change({introductionSeconds:Number(e.target.value)})}/></Field></div>}<details><summary>Candidate settings</summary><label><input type="checkbox" checked={!!settings.oneQuestionAtATime} onChange={e=>change({oneQuestionAtATime:e.target.checked})}/> Show one question at a time</label><label><input type="checkbox" checked={settings.allowBackNavigation !== false} onChange={e=>change({allowBackNavigation:e.target.checked})}/> Allow going back to earlier answers</label><Field label="Assessment version / reference"><Input value={settings.code} maxLength={80} onChange={e=>change({code:e.target.value})}/></Field><Field label="Link expiry (days)"><Input type="number" min={1} max={365} value={settings.linkExpiryDays ?? 7} onChange={e=>change({linkExpiryDays:Number(e.target.value)})}/></Field><Field label="Optional support email"><Input type="email" value={settings.supportEmail} onChange={e=>change({supportEmail:e.target.value})}/></Field><Field label="Allowed tools and assistance"><Textarea value={settings.toolPolicy} maxLength={3000} onChange={e=>change({toolPolicy:e.target.value})}/></Field><label><input type="checkbox" checked={settings.spellCheck} onChange={e=>change({spellCheck:e.target.checked})}/> Enable spelling tools for written responses</label><Field label="Candidate data-use notice"><Textarea value={settings.notice} maxLength={3000} onChange={e=>change({notice:e.target.value})}/></Field></details></section>;
}
function RubricEditor({module:m,onChange}:{module:TestModule;onChange:(patch:Partial<TestModule>)=>void}) {
    const [expanded,setExpanded]=useState<string[]>(()=>m.rubric?.filter(r=>!r.title).map(r=>r.id)||[]);
    const addCriterion=()=>{const criterion=blankCriterion();setExpanded(ids=>[...ids,criterion.id]);onChange({rubric:[...(m.rubric||[]),criterion]});};
    const update=(id:string,patch:Partial<Criterion>)=>onChange({rubric:m.rubric?.map(r=>r.id===id?{...r,...patch}:r)});
    return <section><h3>Human review rubric</h3>{!m.rubric?<Button variant="outline" onClick={addCriterion}>Create editable review criteria</Button>:<>{m.rubric.map((r,i)=><details className="criterion-editor" key={r.id} open={expanded.includes(r.id)} onToggle={event=>{const open=event.currentTarget.open;setExpanded(ids=>open===ids.includes(r.id)?ids:open?[...ids,r.id]:ids.filter(id=>id!==r.id));}}><summary>{r.title || `Criterion ${i+1}`}<span>0–{r.max}</span></summary><div className="criterion-fields"><Field label={`Criterion ${i+1} title`}><Input value={r.title} maxLength={120} onChange={e=>update(r.id,{title:e.target.value})}/></Field><Field label={`Criterion ${i+1} guidance`}><Textarea value={r.help} maxLength={2000} onChange={e=>update(r.id,{help:e.target.value})}/></Field><Field label={`Criterion ${i+1} maximum rating`}><ChoiceSelect label={`Criterion ${i+1} maximum rating`} value={String(r.max)} onChange={value=>{const max=Number(value);update(r.id,{max,anchors:Array.from({length:max+1},(_,n)=>r.anchors[n]||'')});}} options={[1,2,3,4].map(max=>({value:String(max),label:`0–${max}`}))}/></Field>{r.anchors.map((anchor,n)=><Field key={n} label={`${r.title || `Criterion ${i+1}`}: rating ${n} anchor`}><Textarea value={anchor} maxLength={2000} onChange={e=>update(r.id,{anchors:r.anchors.map((a,j)=>j===n?e.target.value:a)})}/></Field>)}{m.rubric!.length>1&&<Button variant="outline" onClick={()=>onChange({rubric:m.rubric?.filter(v=>v.id!==r.id)})}>Remove criterion {i+1}</Button>}</div></details>)}{m.rubric.length<8&&<Button variant="outline" onClick={addCriterion}>Add review criterion</Button>}</>}<Field label="Illustrative response (reviewers only)"><Textarea rows={5} maxLength={5000} value={m.example||''} onChange={e=>onChange({example:e.target.value})}/></Field></section>;
}
function ReviewPanel({ attempt: a, onSave, busy, readOnly }: {
    readOnly: boolean;
    attempt: Attempt;
    onSave: (r: Omit<Review, 'reviewedAt'>) => void;
    busy: boolean;
}) {
    const [ratings, setRatings] = useState<Record<string, number>>(a.review?.ratings || {});
    const [evidence, setEvidence] = useState<Record<string,string>>(a.review?.evidence || {});
    const criteria = reviewCriteria(a.modules);
    const [notes, setNotes] = useState(a.review?.notes || '');
    const [outcome, setOutcome] = useState(a.review?.outcome || 'reviewed');
    const written = a.modules.filter(m => m.kind === 'writing');
    const exportResult = () => { const blob = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `candidate-result-${a.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    return <div className="review-body">{a.status !== 'completed' ? <div className="info-panel"><Clock /><div><h3>Assessment not submitted</h3><p>The attempt is {a.status === 'not-started' ? 'waiting to start' : 'in progress'}. Refresh the workspace after submission to review it.</p></div></div> : <><div className="review-score-row"><div className="objective-score"><small>OBJECTIVE SCORE</small><strong>{a.result?.decisions ? `${a.result.objectiveCorrect} of ${a.result.objectiveTotal}` : a.result?.objective ?? '—'}<span>{a.result?.decisions ? ' correct' : '/100'}</span></strong></div><div><small>Writing review</small><Status value={a.review?.outcome || 'awaiting'}/></div></div>{a.result?.timedOut && <div className="mini-notice">The overall timer expired. Saved answers were submitted automatically.</div>}<Tabs defaultValue="writing"><TabsList variant="line" className="review-tabs"><TabsTrigger value="writing">Written response</TabsTrigger><TabsTrigger value="objective">Automatic evidence</TabsTrigger><TabsTrigger value="summary">Assessment details</TabsTrigger></TabsList><TabsContent value="writing">{written.length ? written.map(m => <section key={m.id} className="written-review"><h3>{m.title}</h3><details open={!!m.rubric}><summary>View customer message & policy</summary><pre className="policy-card">{m.context}</pre><p>{m.prompt}</p></details>{m.example && <details><summary>Example response</summary><p>{m.example}</p></details>}<div className="candidate-response">{a.answers[m.id]?.text || 'No written response was submitted.'}</div></section>) : <p>This test has no written-response module.</p>}<section className="rubric-review"><fieldset disabled={readOnly}><div className="section-heading"><h3>Writing rubric</h3></div>{written.length > 0 && criteria.map(r => <div className="rating-row" key={r.key}><div><strong>{r.title}</strong><details className="rubric-guide"><summary>Scoring guide</summary><p>{r.help}</p><small>{r.anchors.length===r.max+1?r.anchors.map((anchor,n)=>`${n}: ${anchor}`).join(' · '):`0: ${r.anchors[0]} · 2: ${r.anchors[1]} · 4: ${r.anchors[2]}`}</small></details></div><RadioGroup className="rating-options" value={ratings[r.key] === undefined ? '' : String(ratings[r.key])} onValueChange={v => setRatings({ ...ratings, [r.key]: Number(v) })} aria-label={r.title}>{Array.from({length:r.max+1},(_,n)=>n).map(n => <label className={`rating-choice ${ratings[r.key] === n ? 'chosen' : ''}`} key={n}><RadioGroupItem value={String(n)} id={`${a.id}-${r.key}-${n}`} className="sr-only"/>{n}</label>)}</RadioGroup>{r.key.includes(':') && <Field label={`Evidence: ${r.title}`}><Textarea value={evidence[r.key]||''} maxLength={2000} rows={2} onChange={e=>setEvidence({...evidence,[r.key]:e.target.value})}/></Field>}</div>)}{written.length > 0 && !a.modules.some(m=>m.rubric) && <div className="rubric-total"><span>Human writing score</span><strong>{criteria.every(r => ratings[r.key] !== undefined) ? criteria.reduce((n, r) => n + ratings[r.key], 0) : '—'} / 16</strong></div>}<Field label="Review notes & evidence"><Textarea rows={4} value={notes} maxLength={5000} onChange={e => setNotes(e.target.value)} placeholder="What did they get right? What would you explore in an interview?"/></Field><Field label="Review status"><ChoiceSelect value={outcome} onChange={v => setOutcome(v as Review['outcome'])} label="Review outcome" options={[{ value: 'reviewed', label: 'Reviewed' }, { value: 'follow-up', label: 'Needs a follow-up conversation' }, { value: 'not-scorable', label: 'Not scorable — technical or administration issue' }]}/></Field><Button disabled={readOnly || busy || notes.trim().length < 5 || (outcome !== 'not-scorable' && written.length > 0 && (!criteria.every(r=>ratings[r.key]!==undefined) || criteria.some(r=>r.key.includes(':')&&!evidence[r.key]?.trim())))} onClick={() => onSave({ ratings, notes, outcome, evidence })}><Check size={16}/>{readOnly ? 'Read-only review' : 'Save human review'}</Button></fieldset>{a.review && <p className="method-note">Last reviewed {new Date(a.review.reviewedAt).toLocaleString('en-GB')}</p>}</section></TabsContent><TabsContent value="objective">{a.result?.modules.filter(m => m.kind !== 'writing').map(s => <section className="score-detail" key={s.id}><div className="section-heading"><div className="inline-icon"><ModuleIcon kind={s.kind}/><h3>{s.title}</h3></div><strong>{s.kind==='typing'&&s.metric ? s.administration : s.total !== undefined ? `${s.correct} of ${s.total} correct` : `${s.score}/100`}</strong></div>{s.kind === 'typing' ? <><div className="typing-metrics"><div><strong>{s.netWpm}</strong><span>Correct-character WPM</span></div><div><strong>{s.grossWpm}</strong><span>Final-text WPM</span></div><div><strong>{s.accuracy}%</strong><span>Accuracy</span></div></div><p>{s.errors} edit-distance errors · {s.seconds}-second sample{s.ceiling?' · Passage ceiling reached':''}</p><details><summary>Inspect typed text</summary><pre className="policy-card">{a.answers[s.id]?.text || 'No text entered'}</pre></details></> : s.details?.map((d, i) => <div className={`question-evidence ${d.correct ? 'correct' : 'incorrect'}`} key={i}><div><span>{d.correct ? <CheckCircle2 size={17}/> : <span>×</span>}</span><strong>{d.prompt}</strong></div><p><span>Selected</span>{d.selected || 'Unanswered'}</p><p><span>Answer key</span>{d.answer}</p><small>{d.explanation}</small></div>)}</section>)}</TabsContent><TabsContent value="summary"><dl className="summary-list"><dt>Assessment</dt><dd>{a.title}</dd><dt>Test time budget</dt><dd>{formatTime(workDuration(a))}</dd><dt>Submitted</dt><dd>{a.completedAt ? new Date(a.completedAt).toLocaleString('en-GB') : '—'}</dd><dt>Attempt reference</dt><dd>{a.id}</dd><dt>Content version</dt><dd>{a.config?.code || 'Custom assessment'}</dd><dt>Agreed extra work time</dt><dd>{a.config?.adjustmentSeconds||0} seconds</dd><dt>Module versions</dt><dd>{a.modules.map(m=>`${m.code||m.title} v${m.version||1}`).join(', ')}</dd></dl><details><summary>Review history ({a.review?.history?.length||0} earlier reviews)</summary>{a.review?.history?.map((h,i)=><section key={i}><p>{new Date(h.reviewedAt).toLocaleString('en-GB')} · {h.reviewer} · {h.outcome}</p><pre className="policy-card">{JSON.stringify({ratings:h.ratings,evidence:h.evidence,notes:h.notes},null,2)}</pre></section>)}</details><Button variant="outline" onClick={exportResult}><Download size={16}/>Export result JSON</Button></TabsContent></Tabs></>}</div>;
}
