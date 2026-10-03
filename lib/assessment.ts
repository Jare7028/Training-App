export type ModuleKind = 'spelling' | 'grammar' | 'typing' | 'problem' | 'writing' | 'questions';
export type Question = {
    id: string;
    prompt: string;
    options: string[];
    correct: number;
    explanation: string;
    context?: string;
    optionIds?: string[];
    correctOptionId?: string;
};
export type Criterion = { id: string; title: string; help: string; anchors: string[]; max: number };
export type AssessmentConfig = { stage?: 'pilot' | 'approved'; oneQuestionAtATime?: boolean; allowBackNavigation?: boolean; linkExpiryDays?: number; adjustmentSeconds?: number; flexible: boolean; workSeconds: number; introductionSeconds: number; code: string; supportEmail: string; toolPolicy: string; spellCheck: boolean; notice: string };
export type TestModule = {
    id: string;
    kind: ModuleKind;
    title: string;
    seconds: number;
    instructions: string;
    questions?: Question[];
    passage?: string;
    targetWpm?: number;
    context?: string;
    prompt?: string;
    code?: string;
    version?: number;
    practice?: string;
    typingMode?: 'prefix-v1';
    questionIndex?: number;
    questionCount?: number;
    typingSeconds?: number;
    finishTypingEarly?: boolean;
    allowPaste?: boolean;
    rubric?: Criterion[];
    example?: string;
    sequential?: boolean;
};
export type SavedModule = { id: string; module: TestModule; revision: number; updatedAt: number };
export function copyModule(m: TestModule): TestModule { return { ...structuredClone(m), id: crypto.randomUUID(), ...(m.questions ? { questions: m.questions.map(q => ({ ...q, options: [...q.options], id: crypto.randomUUID() })) } : {}) }; }
export const customModuleKinds = ['questions', 'typing', 'writing'] as const;
export function blankQuestion(): Question {
    return { id: crypto.randomUUID(), prompt: '', options: ['', ''], correct: 0, explanation: '' };
}
export function blankCriterion(): Criterion {
    return { id: crypto.randomUUID(), title: '', help: '', max: 3, anchors: ['', '', '', ''] };
}
export function blankModule(kind: ModuleKind): TestModule {
    const base = { id: crypto.randomUUID(), kind, title: '', seconds: 60, instructions: '' };
    if (kind === 'typing') return { ...base, passage: '', practice: '', typingMode: 'prefix-v1', typingSeconds: 60, finishTypingEarly: true, allowPaste: false };
    if (kind === 'writing') return { ...base, seconds: 180, context: '', prompt: '', rubric: [blankCriterion()], example: '' };
    return { ...base, context: '', questions: [blankQuestion()], sequential: false };
}
export type Assessment = {
    id: string;
    title: string;
    description: string;
    status: 'draft' | 'ready';
    modules: TestModule[];
    updatedAt: number;
    revision: number;
    config?: AssessmentConfig;
};
export type Answer = {
    questionIndex?: number;
    choices?: Record<string, number>;
    text?: string;
    typing?: { startedAt: number; deadline: number; complete: boolean; seconds?: number; ceiling?: boolean; interrupted?: boolean };
};
export type ModuleScore = {
    id: string;
    title: string;
    kind: ModuleKind;
    score: number | null;
    correct?: number;
    total?: number;
    grossWpm?: number;
    netWpm?: number;
    accuracy?: number;
    errors?: number;
    seconds?: number;
    metric?: string;
    matched?: number;
    typedLength?: number;
    referenceLength?: number;
    administration?: string;
    ceiling?: boolean;
    details?: {
        prompt: string;
        selected: string | null;
        answer: string;
        correct: boolean;
        explanation: string;
        questionId?: string;
        selectedId?: string | null;
        optionOrder?: string[];
    }[];
};
export type Result = {
    objective: number | null;
    modules: ModuleScore[];
    writingWords: number;
    completedAt: number;
    timedOut: boolean;
    objectiveCorrect?: number;
    objectiveTotal?: number;
    decisions?: boolean;
};
export type Review = {
    ratings: Record<string, number>;
    notes: string;
    outcome: 'reviewed' | 'follow-up' | 'not-scorable';
    reviewedAt: number;
    evidence?: Record<string, string>;
    reviewer?: string;
    history?: Omit<Review, 'history'>[];
};
export type HiringDecision = { stage: string; notes: string; revision: number; updatedAt?: number; updatedBy?: string };
export type Attempt = {
    id: string;
    assessmentId: string;
    hiring?: HiringDecision;
    title: string;
    alias: string;
    status: string;
    createdAt: number;
    startedAt: number | null;
    deadline: number | null;
    completedAt: number | null;
    modules: TestModule[];
    answers: Record<string, Answer>;
    result: Result | null;
    review: Review | null;
    expiresAt: number;
    revoked: boolean;
    revision: number;
    config?: AssessmentConfig;
};
export const kindLabels: Record<ModuleKind, string> = { questions: 'Questions', spelling: 'Message accuracy', grammar: 'Prioritisation & judgement', typing: 'Typing', problem: 'Investigation & policy', writing: 'Written response' };
export const rubric = [
    { id: 'accuracy', title: 'Policy & accuracy', help: 'Uses the facts correctly, protects customer data and avoids unsupported promises', anchors: ['Misstates policy or invents a commitment', 'Mostly correct; one material omission', 'Accurate, complete and safely within policy'] },
    { id: 'empathy', title: 'Empathy & tone', help: 'Acknowledges the specific concern respectfully without sounding dismissive', anchors: ['Dismissive or blames the customer', 'Polite, but generic acknowledgment', 'Specific acknowledgment and calm, respectful language'] },
    { id: 'clarity', title: 'Clear writing', help: 'Readable, concise and understandable; meaning matters more than dialect', anchors: ['Meaning is hard to follow', 'Understandable with some awkward phrasing', 'Easy to scan, concise and grammatically clear'] },
    { id: 'ownership', title: 'Ownership & next step', help: 'Explains what happens next, by whom and when', anchors: ['No useful next step', 'Useful action, but ownership or timing is vague', 'Clear action, owner and realistic follow-up timing'] },
];
export const duration = (mods: TestModule[]) => mods.reduce((n, m) => n + m.seconds, 0);
export const workDuration = (a: Pick<Assessment, 'modules' | 'config'>) => a.config?.flexible ? a.config.workSeconds : a.modules.reduce((n,m)=>n+sectionDuration(m),0);
export const typingSeconds = (m: TestModule): number => m.typingSeconds ?? (m.typingMode === 'prefix-v1' ? 60 : m.seconds);
export const canFinishTypingEarly = (m: TestModule) => m.finishTypingEarly ?? m.typingMode === 'prefix-v1';
export const sectionDuration = (m: TestModule) => m.kind === 'typing' ? typingSeconds(m) : m.seconds;
export function withTypingAdministration(a: Assessment): Assessment {
    if (a.config || !a.modules.some(m => m.kind === 'typing' && m.typingMode === 'prefix-v1')) return a;
    const workSeconds = Math.max(90, duration(a.modules), ...a.modules.filter(m=>m.kind==='typing').map(typingSeconds));
    return { ...a, config: {
        flexible:true, workSeconds, introductionSeconds:0, code:'', supportEmail:'', spellCheck:true,
        toolPolicy:'',
        notice:'',
    } };
}
export function reviewCriteria(modules: TestModule[]) { return modules.filter(m => m.kind === 'writing').flatMap(m => m.rubric ? m.rubric.map(r => ({ ...r, key: `${m.id}:${r.id}`, moduleTitle: m.title })) : rubric.map(r => ({ ...r, max: 4, key: r.id, moduleTitle: m.title }))); }
export const formatTime = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.ceil(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
export const words = (s: string) => s.trim() ? s.trim().split(/\s+/).length : 0;
export function validateAssessment(a: Assessment, publishing = false): string | null {
    if (!a || typeof a !== 'object')
        return 'Invalid assessment.';
    if (typeof a.title !== 'string' || !a.title.trim() || a.title.length > 120)
        return 'Give the assessment a title (up to 120 characters).';
    if (typeof a.description !== 'string' || a.description.length > 1000)
        return 'The description must be under 1,000 characters.';
    if (!Array.isArray(a.modules) || a.modules.length > 12)
        return 'Use no more than 12 modules.';
    if (publishing && !a.modules.length)
        return 'Add at least one module before marking the test ready.';
    if (a.modules.some(m => !m || typeof m !== 'object'))
        return 'Invalid module.';
    if (new Set(a.modules.map(m => m.id)).size !== a.modules.length)
        return 'Module IDs must be unique.';
    if (a.config && ['oneQuestionAtATime','allowBackNavigation'].some(k => a.config![k as keyof AssessmentConfig] !== undefined && typeof a.config![k as keyof AssessmentConfig] !== 'boolean')) return 'Check the question display and navigation settings.';
    if (a.config?.linkExpiryDays !== undefined && (!Number.isInteger(a.config.linkExpiryDays) || a.config.linkExpiryDays < 1 || a.config.linkExpiryDays > 365)) return 'Link expiry must be 1–365 days.';
    if (a.config && (!Number.isInteger(a.config.workSeconds) || a.config.workSeconds < 15 || a.config.workSeconds > 86400 || !Number.isInteger(a.config.introductionSeconds) || a.config.introductionSeconds < 0 || a.config.introductionSeconds > 86400 || typeof a.config.flexible !== 'boolean' || typeof a.config.spellCheck !== 'boolean' || ['code','supportEmail','toolPolicy','notice'].some(k => typeof a.config![k as keyof AssessmentConfig] !== 'string' || String(a.config![k as keyof AssessmentConfig]).length > 3000) || (a.config.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.config.supportEmail)))) return 'Check the work timer, introduction and administration settings.';
    for (const m of a.modules) {
        if (typeof m.id !== 'string' || ['constructor', 'prototype', '__proto__'].includes(m.id) || !/^[a-zA-Z0-9-]{1,60}$/.test(m.id) || !Object.keys(kindLabels).includes(m.kind))
            return 'Invalid module.';
        if (typeof m.title !== 'string' || !m.title.trim() || m.title.length > 120 || !Number.isInteger(m.seconds) || m.seconds < 15 || m.seconds > 86400)
            return 'Each module needs a title and a time limit of 15–86,400 seconds.';
        if (typeof m.instructions !== 'string' || m.instructions.length > 2000 || (m.context !== undefined && (typeof m.context !== 'string' || m.context.length > 8000)))
            return 'Module instructions or context are too long.';
        if ((m.sequential !== undefined && typeof m.sequential !== 'boolean') || (m.code !== undefined && (typeof m.code !== 'string' || m.code.length > 80)) || (m.version !== undefined && (!Number.isInteger(m.version) || m.version < 1)) || (m.practice !== undefined && (typeof m.practice !== 'string' || m.practice.length > 2000)) || (m.typingMode !== undefined && m.typingMode !== 'prefix-v1') || (m.example !== undefined && (typeof m.example !== 'string' || m.example.length > 5000))) return 'Invalid module metadata.';
        if (m.rubric && (!Array.isArray(m.rubric) || m.rubric.length < 1 || m.rubric.length > 8 || new Set(m.rubric.map(r => r.id)).size !== m.rubric.length || m.rubric.some(r => !/^[a-zA-Z0-9-]{1,60}$/.test(r.id) || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 120 || typeof r.help !== 'string' || r.help.length > 2000 || !Number.isInteger(r.max) || r.max < 1 || r.max > 4 || !Array.isArray(r.anchors) || r.anchors.length !== r.max + 1 || r.anchors.some(s => typeof s !== 'string' || !s.trim() || s.length > 2000)))) return 'Each review criterion needs a title and an anchor for every rating.';
        if ((m.kind === 'typing' || m.kind === 'writing') && m.questions !== undefined)
            return 'Typing and writing modules cannot contain objective questions.';
        if (m.kind === 'typing') {
            if ((m.typingSeconds !== undefined && (!Number.isInteger(m.typingSeconds) || m.typingSeconds < 15 || m.typingSeconds > 86400)) || (m.finishTypingEarly !== undefined && typeof m.finishTypingEarly !== 'boolean') || (m.allowPaste !== undefined && typeof m.allowPaste !== 'boolean')) return 'Check the typing duration and options.';
            if (a.config?.flexible === false && typingSeconds(m) > m.seconds) return 'The typing duration must fit within its section time limit.';
            if (typeof m.passage !== 'string' || m.passage.length < 100 || m.passage.length > 5000 || ((m.typingMode !== 'prefix-v1' || m.targetWpm !== undefined) && (!Number.isFinite(m.targetWpm) || m.targetWpm! < 1 || m.targetWpm! > 200)))
                return 'Typing needs a 100–5,000 character passage; legacy scoring also needs a target of 1–200 WPM.';
        }
        else if (m.kind === 'writing') {
            if (typeof m.prompt !== 'string' || !m.prompt.trim() || m.prompt.length > 4000)
                return 'Add a writing prompt (up to 4,000 characters).';
        }
        else {
            if (!Array.isArray(m.questions) || !m.questions.length || m.questions.length > 8)
                return 'Add 1–8 questions to each objective module.';
            if (m.questions.some(q => !q || typeof q !== 'object'))
                return 'Invalid question.';
            if (new Set(m.questions.map(q => q.id)).size !== m.questions.length)
                return 'Question IDs must be unique.';
            for (const q of m.questions)
                if ((q.correctOptionId !== undefined && (!q.optionIds || !q.optionIds.includes(q.correctOptionId))) || (q.context !== undefined && (typeof q.context !== 'string' || q.context.length > 4000)) || (q.optionIds !== undefined && (!Array.isArray(q.optionIds) || q.optionIds.length !== q.options.length || new Set(q.optionIds).size !== q.optionIds.length || q.optionIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,60}$/.test(id))))) return 'Invalid question reference or answer identity.';
            for (const q of m.questions)
                if (typeof q.id !== 'string' || ['constructor', 'prototype', '__proto__'].includes(q.id) || !/^[a-zA-Z0-9-]{1,60}$/.test(q.id) || typeof q.prompt !== 'string' || !q.prompt.trim() || q.prompt.length > 1500 || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 5 || q.options.some(o => typeof o !== 'string' || !o.trim() || o.length > 1000) || new Set(q.options.map(o => typeof o === 'string' ? o.trim() : o)).size !== q.options.length || !Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length || typeof q.explanation !== 'string' || !q.explanation.trim() || q.explanation.length > 2000)
                    return 'Each question needs 2–5 answers, one correct answer and a valid explanation.';
        }
    }
    return null;
}
export function editDistance(a: string, b: string): number { let row = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
        next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
} return row[b.length]; }
export function typingScore(text: string, passage: string, seconds: number, target = 45) {
    const typed = text.replace(/\r\n/g, '\n');
    const reference = passage.slice(0, Math.min(typed.length, passage.length));
    const errors = editDistance(typed, reference);
    const correct = Math.max(0, typed.length - errors);
    const minutes = Math.max(15, seconds) / 60;
    return { score: Math.min(100, Math.round((correct / 5 / minutes) / target * 100)), grossWpm: Math.round(typed.length / 5 / minutes * 10) / 10, netWpm: Math.round(correct / 5 / minutes * 10) / 10, accuracy: typed.length ? Math.round(correct / Math.max(typed.length, reference.length) * 1000) / 10 : 0, errors, seconds };
}
export function scoreAttempt(modules: TestModule[], answers: Record<string, Answer>, completedAt: number, timedOut = false): Result {
    const scores: ModuleScore[] = modules.map(m => {
        const a = answers[m.id] || {};
        const sampleSeconds = a.typing?.seconds ?? (m.kind === 'typing' ? typingSeconds(m) : m.seconds);
        if (m.kind === 'writing')
            return { id: m.id, title: m.title, kind: m.kind, score: null };
        if (m.kind === 'typing')
            return m.typingMode === 'prefix-v1' ? { id: m.id, title: m.title, kind: m.kind, ...prefixTypingScore(a.text || '', m.passage || '', sampleSeconds), score: null, administration: !a.text ? 'Not attempted' : a.typing && (!a.typing.complete || a.typing.interrupted) ? 'Incomplete — technical review' : 'Measured', ceiling: !!a.typing?.ceiling } : { id: m.id, title: m.title, kind: m.kind, ...typingScore(a.text || '', m.passage || '', sampleSeconds, m.targetWpm) };
        const details = (m.questions || []).map(q => ({ questionId: q.id, prompt: q.prompt, selected: typeof a.choices?.[q.id] === 'number' ? q.options[a.choices[q.id]] ?? null : null, selectedId: typeof a.choices?.[q.id] === 'number' ? q.optionIds?.[a.choices[q.id]] || `${q.id}-${a.choices[q.id]}` : null, optionOrder: q.optionIds || q.options.map((_, i) => `${q.id}-${i}`), answer: q.options[q.correct], correct: a.choices?.[q.id] === q.correct, explanation: q.explanation }));
        const correct = details.filter(q => q.correct).length;
        return { id: m.id, title: m.title, kind: m.kind, score: details.length ? Math.round(correct / details.length * 100) : 0, correct, total: details.length, details };
    });
    const objective = scores.filter(s => s.score !== null);
    return { objective: objective.length ? Math.round(objective.reduce((n, s) => n + (s.score || 0), 0) / objective.length) : null, objectiveCorrect: scores.reduce((n,s) => n+(s.correct||0),0), objectiveTotal: scores.reduce((n,s) => n+(s.total||0),0), decisions: modules.some(m => !!m.code || m.typingMode === 'prefix-v1'), modules: scores, writingWords: modules.filter(m => m.kind === 'writing').reduce((n, m) => n + words(answers[m.id]?.text || ''), 0), completedAt, timedOut };
}
export function cleanModule(m: TestModule): TestModule { return { id: m.id, kind: m.kind, title: m.title, seconds: m.seconds, instructions: m.instructions, code: m.code, version: m.version, sequential: m.sequential, ...(m.context !== undefined ? { context: m.context } : {}), ...(m.questions ? { questions: m.questions.map(q => ({ id: q.id, prompt: q.prompt, context: q.context, options: q.options, optionIds: q.optionIds, correctOptionId: q.correctOptionId, correct: q.correctOptionId && q.optionIds ? q.optionIds.indexOf(q.correctOptionId) : q.correct, explanation: q.explanation })) } : {}), ...(m.kind === 'typing' ? { passage: m.passage, targetWpm: m.targetWpm, practice: m.practice, typingMode: m.typingMode, typingSeconds: m.typingSeconds, finishTypingEarly: m.finishTypingEarly, allowPaste: m.allowPaste } : {}), ...(m.kind === 'writing' ? { prompt: m.prompt, rubric: m.rubric, example: m.example } : {}) }; }
export function candidateModule(m: TestModule) { return { id: m.id, kind: m.kind, title: m.title, seconds: m.seconds, instructions: m.instructions, context: m.context, prompt: m.kind === 'writing' ? m.prompt : undefined, passage: m.kind === 'typing' ? m.passage : undefined, practice: m.kind === 'typing' ? m.practice : undefined, sequential: m.sequential, typingMode: m.typingMode, typingSeconds: m.typingSeconds, finishTypingEarly: m.finishTypingEarly, allowPaste: m.allowPaste, questions: m.questions?.map(q => ({ id: q.id, prompt: q.prompt, context: q.context, options: q.options, optionIds: q.optionIds })) }; }

// CS-TYPE-1.0: best reference prefix, longest prefix on ties, Unicode code
// points after NFC. Backtrack ties: match, substitution, deletion, insertion.
export function prefixTypingScore(text: string, passage: string, seconds: number) {
    const normal = (s: string) => Array.from(s.replace(/\r\n?/g, '\n').normalize('NFC'));
    const t = normal(text), r = normal(passage), width = r.length + 1;
    // Carry the selected path's match count alongside two distance rows. This
    // preserves diagonal/delete/insert tie-breaking without a quadratic matrix.
    let previous = new Uint16Array(width), previousMatches = new Uint16Array(width);
    let next = new Uint16Array(width), nextMatches = new Uint16Array(width);
    for (let j=0;j<width;j++) previous[j]=j;
    for (let i=1;i<=t.length;i++) {
        next[0]=i; nextMatches[0]=0;
        for (let j=1;j<width;j++) {
            const equal=t[i-1]===r[j-1], diagonal=previous[j-1]+(equal?0:1), deletion=next[j-1]+1, insertion=previous[j]+1;
            const distance=Math.min(diagonal,deletion,insertion);
            next[j]=distance;
            nextMatches[j]=distance===diagonal?previousMatches[j-1]+(equal?1:0):distance===deletion?nextMatches[j-1]:previousMatches[j];
        }
        [previous,next]=[next,previous]; [previousMatches,nextMatches]=[nextMatches,previousMatches];
    }
    let k=0; for (let j=1;j<width;j++) if(previous[j]<=previous[k]) k=j;
    const m=previousMatches[k];
    const minutes=Math.max(.001,seconds/60), round=(n:number)=>Math.round(n*10)/10;
    return { metric:'CS-TYPE-1.0', typedLength:t.length, referenceLength:k, matched:m, errors:previous[k], grossWpm:round(t.length/(5*minutes)), netWpm:round(m/(5*minutes)), accuracy:t.length?round(100*m/Math.max(t.length,k)):0, seconds };
}
