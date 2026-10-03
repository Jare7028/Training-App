'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Clock, CheckCircle2, ShieldCheck, BookOpen, RefreshCw, Check, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { TestModule, Answer, AssessmentConfig, formatTime, words, typingSeconds, canFinishTypingEarly } from '@/lib/assessment';
import FlexibleCandidate, { FlexibleSession } from './flexible-candidate';
import TypingTest from '@/components/typing-test';
type Session = {
    title: string;
    description: string;
    alias: string;
    status: string;
    preview: boolean;
    seconds: number;
    sections: {
        title: string;
        kind: TestModule['kind'];
        seconds: number;
    }[];
    currentIndex: number;
    module: TestModule | null;
    answer: Answer;
    startedAt: number | null;
    deadline: number | null;
    sectionDeadline: number | null;
    serverNow: number;
    revision: number;
    config?: AssessmentConfig;
};
export default function Candidate({ token }: {
    token: string;
}) {
    const [session, setSession] = useState<Session | null>(null);
    const [answer, setAnswer] = useState<Answer>({});
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [moving,setMoving] = useState(false);
    const questionRef = useRef<HTMLFieldSetElement>(null);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState('');
    const [now, setNow] = useState(() => Date.now());
    const [confirm, setConfirm] = useState(false);
    const clock = useRef<{ server: number; local: number } | null>(null);
    const answerRef = useRef<Answer>({});
    const sessionRef = useRef<Session | null>(null);
    const inFlight = useRef(false);
    const dirty = useRef(false);
    const autosubmitted = useRef('');
    const textRef = useRef<HTMLTextAreaElement | null>(null);
    const accept = useCallback((d: Session, replace = true) => {
        const local = performance.now();
        const estimatedNow = clock.current ? clock.current.server + local - clock.current.local : d.serverNow;
        // A delayed response cannot rewind an already-running countdown.
        clock.current = { server: Math.max(d.serverNow, estimatedNow), local };
        sessionRef.current = d; setSession(d); if (replace) {
        answerRef.current = d.answer || {};
        setAnswer(d.answer || {});
        dirty.current = false;
    } setNow(clock.current.server); if (d.status === 'completed')
        setConfirm(false); }, []);
    const load = useCallback(async () => { try {
        const r = await fetch(`/api/candidate?token=${encodeURIComponent(token)}`);
        const d = await r.json() as Session & {
            error: string;
            conflict?: boolean;
        };
        if (!r.ok)
            throw new Error(d.error);
        accept(d);
        setError('');
    }
    catch (e) {
        setError((e as Error).message);
    } }, [token, accept]);
    useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
    const change = (a: Answer) => { answerRef.current = a; setAnswer(a); dirty.current = true; setSaved('Unsaved changes'); };
    const send = useCallback(async (action: 'start' | 'save' | 'advance' | 'question-next' | 'question-back') => {
        if (inFlight.current)
            return false;
        const s = sessionRef.current;
        if (!s)
            return false;
        inFlight.current = true;
        setBusy(true); setMoving(action !== 'save');
        const outgoing = clone(answerRef.current);
        try {
            const r = await fetch('/api/candidate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action, revision: s.revision, answer: outgoing }) });
            const d = await r.json() as Session & {
                error: string;
                conflict?: boolean;
            };
            if (!r.ok) {
                if (d.conflict) {
                    setError(d.error);
                    return false;
                }
                throw new Error(d.error);
            }
            const changed = d.currentIndex !== s.currentIndex || d.status !== s.status || d.module?.questionIndex !== s.module?.questionIndex;
            accept(d, changed);
            if (!changed) {
                dirty.current = JSON.stringify(outgoing) !== JSON.stringify(answerRef.current);
            }
            setSaved(dirty.current ? 'Unsaved changes' : 'Saved');
            setError('');
            autosubmitted.current = '';
            return true;
        }
        catch (e) {
            setError((e as Error).message);
            setSaved('Not saved');
            return false;
        }
        finally {
            inFlight.current = false;
            setBusy(false); setMoving(false);
        }
    }, [token, accept]);
    useEffect(() => { const interval = setInterval(() => { if (clock.current) setNow(clock.current.server + performance.now() - clock.current.local); }, 250); return () => clearInterval(interval); }, []);
    useEffect(() => { const interval = setInterval(() => { if (dirty.current && sessionRef.current?.status === 'in-progress')
        void send('save'); }, 1500); return () => clearInterval(interval); }, [send]);
    useEffect(() => { if (session?.config?.flexible || session?.status !== 'in-progress' || !session.sectionDeadline)
        return; const key = String(session.currentIndex); if (now >= session.sectionDeadline && !inFlight.current && autosubmitted.current !== key) {
        autosubmitted.current = key;
        void send('advance').then(ok => { if (!ok)
            autosubmitted.current = ''; });
    } }, [now, session, send]);
    useEffect(() => { if (session?.status !== 'in-progress')
        return; const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [session?.status]);
    useEffect(() => { if (session?.status === 'in-progress') {
        const timer = setTimeout(() => textRef.current?.focus(), 100);
        return () => clearTimeout(timer);
    } }, [session?.currentIndex, session?.status]);
    const sectionLeft = Math.max(0, Math.ceil(((session?.sectionDeadline || now) - now) / 1000));
    const totalLeft = Math.max(0, Math.ceil(((session?.deadline || now) - now) / 1000));
    const m = session?.module;
    const nextQuestion = !!session?.config?.oneQuestionAtATime && (m?.questionIndex||0)+1 < (m?.questionCount||0);
    const activeQuestionId = m?.questions?.[0]?.id;
    useEffect(()=>{if(session?.config?.oneQuestionAtATime)questionRef.current?.focus();},[activeQuestionId,session?.config?.oneQuestionAtATime]);
    const completed = session?.status === 'completed';
    if (session?.config?.flexible) return <FlexibleCandidate token={token} initial={session as unknown as FlexibleSession}/>;
    return <div className={`candidate-app${session?.config?.allowBackNavigation === false ? ' forward-only' : ''}`}><header className="candidate-header"><div className="brand" aria-label="Resolvable assessment"><span className="brand-symbol">r</span><strong>resolvable</strong></div>{session?.preview && <span className="private-pill">Test preview</span>}</header><main className="candidate-main">
 {!session ? <>{error ? <div className="candidate-error" role="alert"><ShieldCheck size={30}/><h1>We couldn’t open this assessment</h1><p>{error}</p><Button onClick={() => void load()}><RefreshCw size={17}/>Retry</Button></div> : <><Skeleton className="h-10 w-72"/><Skeleton className="h-96 w-full"/></>}</> : completed ? <section className="completion-card"><span className="completion-mark"><CheckCircle2 size={40}/></span><h1>You’re all done, {session.alias.split(' ')[0]}</h1><p>Your answers have been saved.</p>{session.preview && <><Button variant="outline" asChild><Link href="/" prefetch={false}>Return to workspace</Link></Button></>}</section> : session.status === 'not-started' ? <><div className="candidate-welcome"><h1>{session.title}</h1>{session.description && <p>{session.description}</p>}<div className="candidate-meta"><span><Clock size={18}/>{formatTime(session.seconds)} maximum</span><span><BookOpen size={18}/>{session.sections.length} sections</span></div></div><div className="welcome-layout"><section className="welcome-instructions"><h2>Before you start</h2>{session.config?.toolPolicy&&<p>{session.config.toolPolicy}</p>}{session.config?.notice&&<p>{session.config.notice}</p>}<details className="keyboard-check"><summary>Keyboard check</summary><Textarea rows={2} placeholder="Type here to check your keyboard" aria-label="Unscored keyboard check" spellCheck={false}/></details><label className="ready-checkbox"><Checkbox checked={ready} onCheckedChange={v => setReady(v === true)} id="candidate-ready"/><span>I’m ready to start</span></label>{error && <div className="inline-error" role="alert">{error}</div>}<Button className="candidate-start" disabled={!ready || busy} onClick={() => void send('start')}>{busy ? 'Starting…' : 'Start assessment'}</Button></section><aside className="welcome-sections"><h2>Your work sample</h2><ol>{session.sections.map((s, i) => <li key={i}><span className="section-number">{i + 1}</span><div><strong>{s.title}</strong></div><span>{formatTime(s.seconds)}</span></li>)}</ol></aside></div></> : <div className="candidate-test"><aside className="test-outline"><div className="eyebrow">{session.title}</div><h2>Your progress</h2><Progress aria-label="Assessment progress" value={session.currentIndex / session.sections.length * 100}/><ol>{session.sections.map((s, i) => <li className={i === session.currentIndex ? 'current' : i < session.currentIndex ? 'done' : ''} key={i}><span>{i < session.currentIndex ? <Check size={16}/> : i + 1}</span><div><strong>{s.title}</strong><small>{i < session.currentIndex ? 'Saved & locked' : i === session.currentIndex ? 'In progress' : formatTime(s.seconds)}</small></div></li>)}</ol><div className="overall-clock"><Clock size={18}/><div><small>Total time remaining</small><strong>{formatTime(totalLeft)}</strong></div></div></aside><section className="test-surface"><div className="test-section-heading"><div><div className="eyebrow">SECTION {session.currentIndex + 1} OF {session.sections.length}</div><h1>{m?.title}</h1></div><div className={`section-timer ${sectionLeft < 15 ? 'time-low' : ''}`} role="timer" aria-label={`${sectionLeft} seconds remaining in this section`}><Clock size={18}/><strong>{formatTime(sectionLeft)}</strong><small>this section</small></div></div><p className="test-instructions">{m?.instructions}</p>{m?.questionCount&&<p role="status">Question {(m.questionIndex||0)+1} of {m.questionCount}</p>}{error && <div className="save-error" role="alert"><WifiOff size={20}/><div><strong>Saving needs attention</strong><p>{error} The timer continues. Keep your text here and retry.</p><Button variant="outline" disabled={busy} onClick={() => void send('save')}>Retry saving</Button><Button variant="ghost" disabled={busy} onClick={() => void load()}>Reload saved state</Button></div></div>}
 {m?.context && <pre className="policy-card">{m.context}</pre>}
 {m?.questions?.map((q, i) => (!m.sequential || i===0 || answer.choices?.[m.questions![i-1].id]!==undefined) && <fieldset className="candidate-question" key={q.id} ref={session.config?.oneQuestionAtATime?questionRef:undefined} tabIndex={session.config?.oneQuestionAtATime?-1:undefined}><legend>{(m.questionIndex||0)+i + 1}. {q.prompt}</legend>{q.context&&<pre className="policy-card">{q.context}</pre>}<RadioGroup disabled={moving} value={answer.choices?.[q.id] === undefined ? '' : String(answer.choices[q.id])} onValueChange={v => change({ ...answerRef.current, choices: { ...answerRef.current.choices, [q.id]: Number(v) } })} aria-label={q.prompt}>{q.options.map((o, n) => <label className={`candidate-option ${answer.choices?.[q.id] === n ? 'chosen' : ''}`} key={n}><RadioGroupItem value={String(n)} id={`${q.id}-${n}`}/><span>{o}</span></label>)}</RadioGroup></fieldset>)}
 {m?.kind === 'typing' && <div className="typing-task"><TypingTest readOnly={moving} key={m.id} passage={m.passage||''} value={answer.text||''} onChange={text=>{if(!moving)change({text});}} inputRef={textRef} mode={sectionLeft>0?'active':'complete'} seconds={typingSeconds(m)} remaining={sectionLeft} elapsed={typingSeconds(m)-sectionLeft} allowPaste={m.allowPaste} legacy={m.typingMode!=='prefix-v1'}/></div>}
 {m?.kind === 'writing' && <div className="writing-task"><h3>{m.prompt}</h3><label className="field"><span>Your reply to the customer</span><Textarea ref={textRef} readOnly={moving} value={answer.text || ''} maxLength={5000} spellCheck={session.config?.spellCheck ?? true} rows={10} onChange={e => change({ text: e.target.value })} aria-label="Your reply to the customer" placeholder="Write the message you would send…"/></label><div className="writing-count"><span>{words(answer.text || '')} words</span></div></div>}
 <div className="test-actions"><span className={`save-status ${error ? 'failed' : ''}`} role="status">{busy ? 'Saving…' : saved || 'Saved'}</span><>{session.config?.oneQuestionAtATime&&session.config.allowBackNavigation!==false&&(m?.questionIndex||0)>0&&<Button variant="outline" disabled={busy || sectionLeft===0} onClick={()=>void send('question-back')}>Previous question</Button>}</><Button disabled={busy || (m?.kind === 'typing' && sectionLeft > 0 && !(canFinishTypingEarly(m) && (answer.text||'').normalize('NFC') === (m.passage||'').normalize('NFC')) )} onClick={() => nextQuestion ? void send('question-next') : session.currentIndex === session.sections.length - 1 ? setConfirm(true) : void send('advance')}>{m?.kind === 'typing' && sectionLeft > 0 && !(canFinishTypingEarly(m) && (answer.text||'').normalize('NFC') === (m.passage||'').normalize('NFC')) ? 'Typing sample in progress' : nextQuestion ? 'Next question' : session.currentIndex === session.sections.length - 1 ? 'Submit assessment' : 'Save & continue'}</Button></div></section></div>}
 </main><AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Submit your assessment?</AlertDialogTitle><AlertDialogDescription>You cannot change your answers after submitting.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep writing</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => { setConfirm(false); void send('advance'); }}>Submit assessment</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}
function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
