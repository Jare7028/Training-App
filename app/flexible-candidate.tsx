'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import TypingTest, { TypingPractice } from '@/components/typing-test';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { AssessmentConfig, Answer, TestModule, formatTime, words, typingSeconds, canFinishTypingEarly } from '@/lib/assessment';

export type FlexibleSession = {
    id: string; title: string; description: string; alias: string; status: string; preview: boolean;
    config: AssessmentConfig; seconds: number; modules?: TestModule[];
    sections: { title: string; kind: string; seconds: number }[];
    currentIndex: number; answer: Answer; allAnswers?: Record<string, Answer>;
    deadline: number | null; serverNow: number; revision: number;
};
export default function FlexibleCandidate({ token, initial, embedded = false }: { token: string; initial: FlexibleSession; embedded?: boolean }) {
    const [session, setSession] = useState(initial);
    const [answer, setAnswer] = useState<Answer>(initial.answer || {});
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [moving, setMoving] = useState(false);
    const questionRef = useRef<HTMLFieldSetElement>(null);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState('Saved');
    const [review, setReview] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const submitTrigger = useRef<HTMLButtonElement>(null);
    const completionTitle = useRef<HTMLHeadingElement>(null);
    const [now, setNow] = useState(initial.serverNow);
    const state = useRef(initial), input = useRef(answer), dirty = useRef(false), flight = useRef(false);
    const clock = useRef({ server: initial.serverNow, local: 0 });
    const typingInput = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { clock.current.local = performance.now(); const interval = setInterval(() => setNow(clock.current.server + performance.now() - clock.current.local), 250); return () => clearInterval(interval); }, []);
    const accept = useCallback((next: FlexibleSession, replace: boolean) => {
        state.current = next; setSession(next);
        const local = performance.now();
        // Delayed acknowledgements must not rewind the already-running countdown.
        const estimatedNow = clock.current.server + local - clock.current.local;
        clock.current = { server: Math.max(next.serverNow, estimatedNow), local };
        if (replace) { input.current = next.answer || {}; setAnswer(input.current); dirty.current = false; }
        if (next.status === 'completed') { setConfirm(false); setReview(false); }
    }, []);
    const send = useCallback(async (action: string, index?: number) => {
        if (flight.current) return false;
        flight.current = true; setBusy(true); setMoving(!['save','typing-interrupted'].includes(action));
        const outgoing = structuredClone(input.current), previous = state.current;
        try {
            const response = await fetch('/api/candidate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action, index, revision: previous.revision, answer: outgoing }) });
            const next = await response.json();
            if (!response.ok) throw new Error(next.error || 'Submission not confirmed. Retry saving.');
            const keepEdits = (action === 'save' || action === 'typing-interrupted') && next.status === previous.status && next.currentIndex === previous.currentIndex;
            const editedWhileSaving = JSON.stringify(outgoing) !== JSON.stringify(input.current);
            accept(next, !keepEdits);
            if (keepEdits) {
                if (action === 'typing-interrupted') {
                    // A reload acknowledgement updates timing metadata, not newer keystrokes.
                    input.current = { ...next.answer, text: input.current.text };
                    setAnswer(input.current);
                }
                dirty.current = editedWhileSaving;
            }
            setError(''); setSaved(dirty.current ? 'Unsaved changes' : 'Saved');
            return true;
        } catch (e) { setError((e as Error).message); setSaved('Not saved'); return false; }
        finally { flight.current = false; setBusy(false); setMoving(false); }
    }, [token, accept]);
    useEffect(() => { const interval = setInterval(() => { if (dirty.current && state.current.status === 'in-progress') void send('save'); }, 1500); return () => clearInterval(interval); }, [send]);
    const section = session.modules?.[session.currentIndex];
    const noBack = session.config.allowBackNavigation === false;
    const nextQuestion = !!session.config.oneQuestionAtATime && (section?.questionIndex || 0) + 1 < (section?.questionCount || 0);
    const activeQuestionId = section?.questions?.[0]?.id;
    useEffect(()=>{if(session.config.oneQuestionAtATime){ const question=questionRef.current; question?.focus({preventScroll:true}); question?.querySelector('legend')?.scrollIntoView({block:'start',behavior:'instant'}); }},[activeQuestionId,session.config.oneQuestionAtATime]);
    const typing = answer.typing;
    const typingStartedAt = typing?.startedAt, typingComplete = typing?.complete;
    useEffect(() => {
        if (typingStartedAt && !typingComplete) typingInput.current?.focus();
    }, [typingStartedAt, typingComplete]);
    const typingWindow = section ? typingSeconds(section) : 60;
    const totalLeft = Math.max(0, Math.ceil(((session.deadline || now) - now) / 1000));
    const typingLeft = Math.max(0, Math.ceil(((typing?.deadline || now) - now) / 1000));
    useEffect(() => { if (session.status !== 'in-progress' || flight.current) return;
        if (session.deadline && now >= session.deadline) void send('submit');
        else if (section?.kind === 'typing' && typing && !typing.complete && now >= typing.deadline) void send('typing-finish');
    }, [now, session.status, session.deadline, section?.kind, typing, send]);
    useEffect(() => {
        const initialTyping = initial.allAnswers?.[initial.modules?.[initial.currentIndex]?.id || '']?.typing;
        if (initialTyping && !initialTyping.complete) void send('typing-interrupted');
        // A reload during measured typing is retained as a technical-review flag.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => { if (session.status !== 'in-progress') return; const handler = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [session.status]);
    const change = (next: Answer) => { input.current = next; setAnswer(next); dirty.current = true; setSaved('Unsaved changes'); };
    async function reload() { try { const response = await fetch('/api/candidate?token=' + token); const next = await response.json(); if (!response.ok) throw new Error(next.error); accept(next, true); setError(''); } catch(e) { setError((e as Error).message); } }
    const measured = section?.kind === 'typing' && !!typing && !typing.complete;
    const answers = { ...session.allAnswers, ...(section ? { [section.id]: answer } : {}) };
    const support = session.config.supportEmail ? <a href={'mailto:' + session.config.supportEmail}>Contact assessment support</a> : null;
    return <div className={`candidate-app flexible-assessment${noBack ? ' forward-only' : ''}`}><header className="candidate-header"><div className="brand" aria-label="Resolvable assessment"><span className="brand-symbol">r</span><strong>resolvable</strong></div>{session.preview && !embedded && <span className="private-pill">Test preview</span>}</header><main className="candidate-main">

        {session.status === 'completed' ? <section className="completion-card"><h1 ref={completionTitle} tabIndex={-1}>Your responses have been submitted</h1><p>You can close this page.</p>{support&&<p>{support}</p>}{session.preview && !embedded && <Button asChild><Link href="/">Return to workspace</Link></Button>}</section> : session.status === 'not-started' ? <>
            <div className="candidate-welcome"><h1>{session.title}</h1>{session.description && <p>{session.description}</p>}<p>{formatTime(session.seconds)} · {session.sections.length} sections</p></div>
            <div className="welcome-layout"><section className="welcome-instructions"><h2>Before you start</h2>{session.config.toolPolicy&&<p>{session.config.toolPolicy}</p>}{session.config.notice&&<p>{session.config.notice}</p>}{support&&<p>{support}</p>}<details className="keyboard-check"><summary>Keyboard check</summary><Textarea aria-label="Unscored keyboard check" rows={2} placeholder="Type here to check your keyboard"/></details><label className="ready-checkbox"><Checkbox checked={ready} onCheckedChange={v=>setReady(v===true)} id="flexible-ready"/><span>I’m ready to start</span></label>{error && <div className="save-error" role="alert"><div><strong>We couldn’t confirm the start</strong><p>{error}</p><Button disabled={busy} variant="outline" onClick={()=>void reload()}>Reload saved state</Button></div></div>}<Button disabled={!ready || busy} onClick={()=>void send('start')}>Start assessment</Button></section><aside className="welcome-sections"><h2>Your work sample</h2><ol>{session.sections.map((s,i)=><li key={i}><span>{i+1}</span><div><strong>{s.title}</strong></div></li>)}</ol></aside></div>
        </> : <div className="candidate-test"><aside className="test-outline"><h2>Your progress</h2><ol>{session.sections.map((s,i)=><li className={i===session.currentIndex?'current':''} key={i}><div><Button variant="ghost" disabled={busy || measured || noBack} onClick={()=>void send('navigate',i).then(ok=>{if(ok)setReview(false);})}>{i+1}. {s.title}</Button>{s.kind==='typing' && answers[session.modules?.[i]?.id||'']?.typing?.complete&&<small>Typing locked</small>}</div></li>)}</ol><div className="overall-clock"><small>Work time remaining</small><strong role="timer" aria-label="Work time remaining">{formatTime(totalLeft)}</strong></div><p role="status">{totalLeft <= 60 ? 'One minute or less remains. Saved work will be submitted when time expires.' : ''}</p></aside><section className="test-surface">
            {error && !confirm && <div className="save-error" role="alert"><div><strong>Saving needs attention</strong><p>{error} Your text is retained here. Submission is not confirmed.</p><Button disabled={busy} onClick={()=>void send('save')}>Retry saving</Button><Button disabled={busy} variant="outline" onClick={()=>void reload()}>Reload saved state</Button></div></div>}
            {review ? <><h1>Review your answers</h1>{session.modules?.map((m,i)=><section className="question-evidence" key={m.id}><h2>{m.title}</h2>{m.questions?.map(q=><p key={q.id}>{q.prompt}<br/><strong>{answers[m.id]?.choices?.[q.id]===undefined?'Unanswered':q.options[answers[m.id].choices![q.id]]}</strong></p>)}{m.kind==='writing'&&<p>{answers[m.id]?.text||'No written reply yet.'}</p>}{m.kind==='typing'&&<p>{answers[m.id]?.typing?.complete?'Typing sample saved and locked':answers[m.id]?.typing?'Typing incomplete — technical review':'Typing not attempted'}</p>}<Button variant="outline" disabled={busy} onClick={()=>void send('navigate',i).then(ok=>{if(ok)setReview(false);})}>Review section {i+1}</Button></section>)}<Button ref={submitTrigger} disabled={busy} onClick={()=>setConfirm(true)}>Submit assessment</Button></> : <>
                <div className="test-section-heading"><div><small>SECTION {session.currentIndex+1} OF {session.sections.length}</small><h1>{section?.title}</h1></div></div><p>{section?.instructions}</p>{section?.questionCount&&<p role="status">Question {(section.questionIndex||0)+1} of {section.questionCount}</p>}
                {section?.context && <pre className="policy-card">{section.context}</pre>}
                {section?.questions?.map((q,i)=> (!section.sequential || i===0 || answer.choices?.[section.questions![i-1].id]!==undefined) && <fieldset className="candidate-question" key={q.id} ref={session.config.oneQuestionAtATime?questionRef:undefined} tabIndex={session.config.oneQuestionAtATime?-1:undefined}><legend>{(section.questionIndex||0)+i+1}. {q.prompt}</legend>{q.context&&<pre className="policy-card">{q.context}</pre>}<RadioGroup disabled={moving} aria-label={q.prompt} value={answer.choices?.[q.id]===undefined?'':String(answer.choices[q.id])} onValueChange={v=>change({...input.current,choices:{...input.current.choices,[q.id]:Number(v)}})}>{q.options.map((o,n)=><label className={`candidate-option ${answer.choices?.[q.id]===n?'chosen':''}`} key={q.optionIds?.[n]||n}><RadioGroupItem value={String(n)} id={`${q.id}-${n}`}/><span>{o}</span></label>)}</RadioGroup></fieldset>)}
                {section?.kind==='typing'&&<div className="typing-task">
                    <TypingTest readOnly={moving} key={section.id} passage={section.passage||''} value={answer.text||''} onChange={text=>{if(!moving)change({...input.current,text});}} inputRef={typingInput} mode={!typing?'ready':typing.complete?'complete':'active'} seconds={typingWindow} remaining={typing?typingLeft:typingWindow} allowPaste={section.allowPaste} legacy={section.typingMode!=='prefix-v1'} elapsed={typing?.seconds ?? (typing ? Math.max(0,(now-typing.startedAt)/1000) : 0)}/>
                    {!typing?<>
                        {section.practice&&<TypingPractice key={section.id} passage={section.practice}/>}

                        <Button disabled={busy || totalLeft<typingWindow} onClick={()=>void send('typing-start')}>Start {typingWindow}-second task</Button>
                        {totalLeft<typingWindow&&<p>Less than {typingWindow} seconds remain. You can still review and submit your other answers.</p>}
                    </>:<>
                        {typing.interrupted&&<p role="status">This sample was interrupted and will be flagged for technical review.</p>}
                        {!typing.complete&&canFinishTypingEarly(section)&&<Button disabled={busy || (answer.text||'').normalize('NFC')!==(section.passage||'').normalize('NFC')} onClick={()=>void send('typing-finish')}>Finish complete passage early</Button>}
                    </>}
                </div>}
                {section?.kind==='writing'&&<div className="writing-task"><h2>{section.prompt}</h2><label className="field"><span>Your reply to the customer</span><Textarea aria-label="Your reply to the customer" value={answer.text||''} maxLength={5000} rows={10} readOnly={moving} spellCheck={session.config.spellCheck} onChange={e=>change({text:e.target.value})}/></label><p>{words(answer.text||'')} words</p></div>}
                <div className="test-actions"><span className="save-status" role="status" aria-live="polite">{busy?'Saving…':saved}</span>{session.config.oneQuestionAtATime&&!noBack&&(section?.questionIndex||0)>0&&<Button variant="outline" disabled={busy} onClick={()=>void send('question-back')}>Previous question</Button>}<Button ref={submitTrigger} disabled={busy || measured} onClick={()=>nextQuestion ? void send('question-next') : session.currentIndex < session.sections.length-1 ? void send('navigate',session.currentIndex+1) : noBack ? setConfirm(true) : void send('save').then(ok=>{if(ok)setReview(true);})}>{nextQuestion?'Next question':session.currentIndex < session.sections.length-1?'Save & continue':noBack?'Submit assessment':'Review answers'}</Button></div>
            </>}
        </section></div>}
    </main>
        <AlertDialog open={confirm} onOpenChange={open=>{if(!moving)setConfirm(open);}}>
            <AlertDialogContent onCloseAutoFocus={event=>{event.preventDefault();(state.current.status==='completed'?completionTitle.current:submitTrigger.current)?.focus();}}>
                <AlertDialogHeader>
                    <AlertDialogTitle>Submit your assessment?</AlertDialogTitle>
                    <AlertDialogDescription>You cannot change your answers after submitting.</AlertDialogDescription>
                </AlertDialogHeader>
                {error&&<p className="submission-error" role="alert">{error}</p>}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                    <AlertDialogAction disabled={busy} onClick={event=>{event.preventDefault();void send('submit');}}>Confirm submission</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>;
}
