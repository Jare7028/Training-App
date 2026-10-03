'use client';
import { useDeferredValue, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Check, Clock, Keyboard } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { formatTime, prefixTypingScore, typingScore } from '@/lib/assessment';
import { typingFeedback } from '@/lib/typing-feedback';
import styles from './typing-test.module.css';

type Props = {
    passage: string; value: string; onChange: (text: string) => void;
    mode: 'ready' | 'active' | 'complete'; seconds: number; remaining: number; elapsed: number;
    inputRef?: Ref<HTMLTextAreaElement>; label?: string; practice?: boolean; legacy?: boolean; allowPaste?: boolean; readOnly?: boolean;
};

export default function TypingTest({ passage, value, onChange, mode, seconds, remaining, elapsed, inputRef, label = 'Your typed copy', practice = false, legacy = false, allowPaste = false, readOnly = false }: Props) {
    const id = useId(), viewport = useRef<HTMLDivElement>(null), active = useRef<HTMLSpanElement>(null);
    const ownInput = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(inputRef, () => ownInput.current!);
    const [selection, setSelection] = useState(value.length), [focused, setFocused] = useState(false), [notice, setNotice] = useState('');
    const deferred = useDeferredValue(value);
    const feedback = useMemo(() => typingFeedback(passage, value, Math.min(selection, value.length)), [passage, value, selection]);
    const metrics = useMemo(() => legacy ? typingScore(deferred, passage, 60) : prefixTypingScore(deferred, passage, 60), [deferred, passage, legacy]);
    const duration = Math.max(mode === 'complete' ? .001 : 1, Math.min(seconds, elapsed));
    const speed = (rate: number) => (Math.round(rate * 60 / duration * 10) / 10).toFixed(1);
    const nextKey = feedback.expected === ' ' ? 'Space' : feedback.expected === '\n' ? 'Enter' : feedback.expected === '\t' ? 'Tab' : feedback.expected;
    const caretOffset = feedback.items[feedback.activeIndex]?.offset;
    useEffect(() => {
        const container = viewport.current, target = active.current;
        if (!container || !target || mode === 'ready') return;
        const bounds = container.getBoundingClientRect(), caret = target.getBoundingClientRect();
        if (caret.top < bounds.top + 30 || caret.bottom > bounds.bottom - 30) container.scrollTop += caret.top - bounds.top - 60;
    }, [feedback.activeIndex, caretOffset, mode]);
    const focusInput = () => { if (mode === 'active' && (practice || remaining > 0)) ownInput.current?.focus({ preventScroll: true }); };
    return <div className={styles.test} data-typing-test data-mode={mode}>
        <div className={styles.metrics} aria-label={practice ? 'Practice feedback' : 'Automatic typing measurements'}>
            {!practice && <div className={`${styles.metric} ${remaining <= 10 && mode === 'active' ? styles.timeLow : ''}`}><span><Clock size={14}/> Time left</span><strong role="timer" aria-label="Typing time remaining">{formatTime(mode === 'ready' ? seconds : mode === 'complete' ? 0 : remaining)}</strong></div>}
            {!practice && <div className={styles.metric} title="Characters typed ÷ 5 ÷ elapsed minutes"><span>Typing speed</span><strong data-typing-wpm>{mode === 'ready' || !value ? '—' : speed(metrics.grossWpm)}<small>WPM</small></strong></div>}
            <div className={styles.metric}><span>Accuracy</span><strong data-typing-accuracy>{!value ? '—' : metrics.accuracy.toFixed(1) + '%'} </strong></div>
            <div className={styles.metric}><span>Character errors</span><strong data-typing-errors>{!value ? '—' : metrics.errors}</strong></div>
        </div>
        {!practice && <div className={styles.timeTrack} aria-hidden="true"><div style={{width: `${mode === 'ready' ? 100 : mode === 'complete' ? 0 : Math.max(0, remaining / seconds * 100)}%`}}/></div>}
        <div className={styles.referenceHeader}><span><Keyboard size={16}/> {practice ? 'Practice passage' : 'Reference passage'}</span><span>{mode === 'active' && (nextKey ? <>Next key <kbd>{nextKey}</kbd></> : 'End of passage')}</span></div>
        <div className={`${styles.passage} ${focused ? styles.focused : ''}`} ref={viewport} tabIndex={0} role="region" aria-label={practice ? 'Practice reference passage' : 'Typing reference passage'} onClick={focusInput} onKeyDown={e => {if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusInput(); }}}>
            <span className={styles.srOnly}>{passage}</span>
            <div aria-hidden="true" className={styles.words}>
                {feedback.items.map((word, i) => <span key={i} className={styles.word} data-state={word.state} data-current={word.current && mode !== 'complete' ? 'true' : undefined}>
                    {word.rendered.map((char, n) => <span key={n} className={`${styles.char} ${styles[char.state]} ${word.current && n === Math.min(word.offset, word.rendered.length) && mode !== 'complete' ? styles.caret : ''}`} ref={word.current && n === Math.min(word.offset, word.rendered.length) ? active : undefined}>{char.char === '\n' ? <><span className={styles.returnMark}>↵</span>{'\n'}</> : char.char}</span>)}
                    {word.current && word.offset >= word.rendered.length && mode !== 'complete' && <span ref={active} className={styles.endCaret}/>}
                </span>)}
                {feedback.activeIndex >= feedback.items.length && mode !== 'complete' && <span ref={active} className={styles.endCaret}/>}
            </div>
        </div>

        {mode !== 'ready' && <><label className={styles.inputLabel} htmlFor={id}>{label}</label><Textarea id={id} aria-label={label} ref={ownInput} aria-describedby={id+'-help'} className={styles.input} rows={3} value={value} readOnly={readOnly || mode === 'complete' || (!practice && remaining <= 0)} maxLength={5000} spellCheck={false} autoCorrect="off" autoComplete="off" autoCapitalize="off" placeholder="Type the reference passage here…" onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onSelect={e=>setSelection(e.currentTarget.selectionStart)} onPaste={e=>{if(!allowPaste){e.preventDefault();setNotice('Pasting is disabled.');}}} onDrop={e=>{if(!allowPaste){e.preventDefault();setNotice('Dropping text is disabled.');}}} onChange={e=>{if (readOnly || mode !== 'active' || (!practice && remaining <= 0)) return;setSelection(e.target.selectionStart);onChange(e.target.value);setNotice('');}}/>
        <p id={id+'-help'} className={mode === 'complete' ? styles.help : styles.srOnly}>{mode === 'complete' ? <><Check size={14}/> {practice ? 'Practice complete.' : 'Typing saved and locked.'}</> : 'Backspace to correct.'}</p><p className={styles.notice} role="status">{notice}</p></>}
    </div>;
}

export function TypingPractice({ passage }: { passage: string }) {
    const [value, setValue] = useState('');
    return <details className={styles.practice}><summary>Optional unscored practice</summary><TypingTest passage={passage} value={value} onChange={setValue} mode="active" seconds={60} remaining={60} elapsed={0} label="Typing practice" practice/><button type="button" className={styles.reset} onClick={()=>setValue('')}>Clear practice</button></details>;
}
