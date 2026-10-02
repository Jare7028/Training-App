'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AssessmentConfig, Answer, TestModule, formatTime, words } from '@/lib/assessment';

export type FlexibleSession = {
    id: string; title: string; description: string; alias: string; status: string; preview: boolean;
    config: AssessmentConfig; seconds: number; modules?: TestModule[];
    sections: { title: string; kind: string; seconds: number }[];
    currentIndex: number; answer: Answer; allAnswers?: Record<string, Answer>;
    deadline: number | null; serverNow: number; revision: number;
};
export default function FlexibleCandidate({ token, initial }: { token: string; initial: FlexibleSession }) {
    const [session, setSession] = useState(initial);
    const [answer, setAnswer] = useState<Answer>(initial.answer || {});
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState('Saved');
    const [review, setReview] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [now, setNow] = useState(initial.serverNow);
    const state = useRef(initial), input = useRef(answer), dirty = useRef(false), flight = useRef(false);
    const clock = useRef({ server: initial.serverNow, local: 0 });
    const typingInput = useRef<HTMLTextAreaElement>(null);
    useEffect(() => { clock.current.local = performance.now(); const interval = setInterval(() => setNow(clock.current.server + performance.now() - clock.current.local), 250); return () => clearInterval(interval); }, []);
    const accept = useCallback((next: FlexibleSession, replace: boolean) => {
        state.current = next; setSession(next); clock.current = { server: next.serverNow, local: performance.now() };
        if (replace) { input.current = next.answer || {}; setAnswer(input.current); dirty.current = false; }
        if (next.status === 'completed') { setConfirm(false); setReview(false); }
    }, []);
    const send = useCallback(async (action: string, index?: number) => {
        if (flight.current) return false;
        flight.current = true; setBusy(true);
        const outgoing = structuredClone(input.current), previous = state.current;
        try {
            const response = await fetch('/api/candidate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action, index, revision: previous.revision, answer: outgoing }) });
            const next = await response.json();
            if (!response.ok) throw new Error(next.error || 'Submission not confirmed. Retry saving.');
            accept(next, action !== 'save' || next.status === 'completed');
            if (action === 'save') dirty.current = JSON.stringify(outgoing) !== JSON.stringify(input.current);
            setError(''); setSaved(dirty.current ? 'Unsaved changes' : 'Saved');
            if (action === 'typing-start') requestAnimationFrame(() => typingInput.current?.focus());
            return true;
        } catch (e) { setError((e as Error).message); setSaved('Not saved'); return false; }
        finally { flight.current = false; setBusy(false); }
    }, [token, accept]);
    useEffect(() => { const interval = setInterval(() => { if (dirty.current && state.current.status === 'in-progress') void send('save'); }, 1500); return () => clearInterval(interval); }, [send]);
    const section = session.modules?.[session.currentIndex];
    const typing = answer.typing;
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
    const support = session.config.supportEmail ? <a href={'mailto:' + session.config.supportEmail}>Contact assessment support</a> : <span>For help or an adjustment, contact the person who sent your assessment link.</span>;
    return <div className="candidate-app flexible-assessment"><header className="candidate-header"><Link className="brand" href="/login"><span className="brand-symbol">r</span><strong>resolvable</strong></Link><span className="private-pill">{session.preview ? 'Test preview' : 'Assessment'}</span></header><main className="candidate-main">
        {session.preview && <div className="mini-notice">Test preview · Your responses will not appear in candidate results.</div>}
        {session.status === 'completed' ? <section className="completion-card"><h1>Your responses have been submitted</h1><p>Thank you for taking the assessment. The hiring team will review your answers and contact you about the next step.</p><p>Attempt reference: {session.id}</p><p>{support}</p>{session.preview && <Button asChild><Link href="/">Return to workspace</Link></Button>}</section> : session.status === 'not-started' ? <>
            <div className="candidate-welcome"><h1>{session.title}</h1><p>{session.description}</p><p>About {Math.ceil((session.seconds + session.config.introductionSeconds)/60)} minutes · {formatTime(session.seconds)} timed work · {session.sections.length} sections</p></div>
            <div className="welcome-layout"><section className="welcome-instructions"><h2>Before you start</h2><p>All customers and policies are fictional. Everything you need is provided. Choose the best-supported answers and write your customer reply in your own words.</p><p>You can revisit and edit non-typing answers until submission. The typing sample has a separate, deliberate start and a fixed 60-second window. The work timer includes reading, practice and review; it cannot be paused.</p><p>{session.config.toolPolicy}</p><p>{session.config.notice}</p><p>Do not include real customer details, passwords, payment information or medical information in your answers.</p><p>{support}</p><h3>Unscored keyboard check</h3><Textarea aria-label="Unscored keyboard check" rows={2} placeholder="Case 2048 is open. The next update is due at 14:30."/><label className="ready-checkbox"><Checkbox checked={ready} onCheckedChange={v=>setReady(v===true)} id="flexible-ready"/><span>I’ve read the instructions and I’m ready to start</span></label><Button disabled={!ready || busy} onClick={()=>void send('start')}>Start assessment</Button></section><aside className="welcome-sections"><h2>Your work sample</h2><ol>{session.sections.map((s,i)=><li key={i}><span>{i+1}</span><div><strong>{s.title}</strong><small>{formatTime(s.seconds)} suggested</small></div></li>)}</ol><p>Section times are guidance. Spend unused time where you need it.</p></aside></div>
        </> : <div className="candidate-test"><aside className="test-outline"><h2>Your progress</h2><ol>{session.sections.map((s,i)=><li className={i===session.currentIndex?'current':''} key={i}><div><Button variant="ghost" disabled={busy || measured} onClick={()=>void send('navigate',i).then(ok=>{if(ok)setReview(false);})}>{i+1}. {s.title}</Button><small>{s.kind==='typing' && answers[session.modules?.[i]?.id||'']?.typing?.complete?'Typing locked':'Answers can be reviewed'}</small></div></li>)}</ol><div className="overall-clock"><small>Work time remaining</small><strong role="timer" aria-label="Work time remaining">{formatTime(totalLeft)}</strong></div><p role="status">{totalLeft <= 60 ? 'One minute or less remains. Saved work will be submitted when time expires.' : ''}</p></aside><section className="test-surface">
            {error && <div className="save-error" role="alert"><div><strong>Saving needs attention</strong><p>{error} Your text is retained here. Submission is not confirmed.</p><Button disabled={busy} onClick={()=>void send('save')}>Retry saving</Button><Button disabled={busy} variant="outline" onClick={()=>void reload()}>Reload saved state</Button></div></div>}
            {review ? <><h1>Review your answers</h1><p>You can return to any non-typing section before submitting.</p>{session.modules?.map((m,i)=><section className="question-evidence" key={m.id}><h2>{m.title}</h2>{m.questions?.map(q=><p key={q.id}>{q.prompt}<br/><strong>{answers[m.id]?.choices?.[q.id]===undefined?'Unanswered':q.options[answers[m.id].choices![q.id]]}</strong></p>)}{m.kind==='writing'&&<p>{answers[m.id]?.text||'No written reply yet.'}</p>}{m.kind==='typing'&&<p>{answers[m.id]?.typing?.complete?'Typing sample saved and locked':answers[m.id]?.typing?'Typing incomplete — technical review':'Typing not attempted'}</p>}<Button variant="outline" disabled={busy} onClick={()=>void send('navigate',i).then(ok=>{if(ok)setReview(false);})}>Review section {i+1}</Button></section>)}<Button disabled={busy} onClick={()=>setConfirm(true)}>Submit assessment</Button></> : <>
                <div className="test-section-heading"><div><small>SECTION {session.currentIndex+1} OF {session.sections.length}</small><h1>{section?.title}</h1></div><span>{section?.kind==='typing'&&typing&&!typing.complete?`${formatTime(typingLeft)} typing`:formatTime(totalLeft)+' work left'}</span></div><p>{section?.instructions}</p>
                {section?.context && <pre className="policy-card">{section.context}</pre>}
                {section?.questions?.map((q,i)=> (!section.sequential || i===0 || answer.choices?.[section.questions![i-1].id]!==undefined) && <fieldset className="candidate-question" key={q.id}><legend>{i+1}. {q.prompt}</legend>{q.context&&<pre className="policy-card">{q.context}</pre>}<RadioGroup aria-label={q.prompt} value={answer.choices?.[q.id]===undefined?'':String(answer.choices[q.id])} onValueChange={v=>change({...input.current,choices:{...input.current.choices,[q.id]:Number(v)}})}>{q.options.map((o,n)=><label className={`candidate-option ${answer.choices?.[q.id]===n?'chosen':''}`} key={q.optionIds?.[n]||n}><RadioGroupItem value={String(n)} id={`${q.id}-${n}`}/><span>{o}</span></label>)}</RadioGroup></fieldset>)}
                {section?.kind==='typing'&&<div className="typing-task"><h2>Reference passage</h2><div className="typing-passage" tabIndex={0} role="region" aria-label="Typing reference passage">{section.passage}</div>{!typing?<><h3>Optional unscored practice</h3><p>{section.practice}</p><Textarea aria-label="Typing practice" rows={2} spellCheck={false}/><p>The measured sample starts only when you press the button. It cannot be retaken.</p><Button disabled={busy || totalLeft<60} onClick={()=>void send('typing-start')}>Start 60-second task</Button>{totalLeft<60&&<p>Less than 60 seconds remain. You can still review and submit your other answers.</p>}</>:<><label className="field"><span>Your typed copy</span><Textarea ref={typingInput} aria-label="Your typed copy" rows={7} disabled={typing.complete} value={answer.text||''} maxLength={5000} spellCheck={false} autoCorrect="off" autoComplete="off" onChange={e=>change({...input.current,text:e.target.value})}/></label><p>{typing.complete?'Typing saved and locked.':`${typingLeft} seconds left. Corrections are allowed.`}{typing.interrupted?' This sample was interrupted and will be flagged for technical review.':''}</p>{!typing.complete&&<Button disabled={busy || (answer.text||'').normalize('NFC')!==(section.passage||'').normalize('NFC')} onClick={()=>void send('typing-finish')}>Finish complete passage early</Button>}</>}</div>}
                {section?.kind==='writing'&&<div className="writing-task"><h2>{section.prompt}</h2><label className="field"><span>Your reply to the customer</span><Textarea aria-label="Your reply to the customer" value={answer.text||''} maxLength={5000} rows={10} spellCheck={session.config.spellCheck} onChange={e=>change({text:e.target.value})}/></label><p>{words(answer.text||'')} words · Suggested length is guidance, with no automatic penalty.</p></div>}
                <div className="test-actions"><span className="save-status" role="status" aria-live="polite">{busy?'Saving…':saved}</span><Button disabled={busy || measured} onClick={()=>session.currentIndex < session.sections.length-1 ? void send('navigate',session.currentIndex+1) : void send('save').then(ok=>{if(ok)setReview(true);})}>{session.currentIndex < session.sections.length-1?'Save & continue':'Review answers'}</Button></div>
            </>}
            {confirm&&<section className="mini-notice"><h2>Submit your assessment?</h2><p>Your saved answers will be locked for human review.</p><Button disabled={busy} onClick={()=>void send('submit')}>Confirm submission</Button><Button variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>Keep reviewing</Button></section>}
        </section></div>}
    </main><footer className="candidate-footer">Resolvable Assess · {support}</footer></div>;
}
