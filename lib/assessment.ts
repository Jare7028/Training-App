export type ModuleKind = 'spelling' | 'grammar' | 'typing' | 'problem' | 'writing';
export type Question = {
    id: string;
    prompt: string;
    options: string[];
    correct: number;
    explanation: string;
};
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
};
export type SavedModule = { id: string; module: TestModule; revision: number; updatedAt: number };
export function copyModule(m: TestModule): TestModule { return { ...structuredClone(m), id: crypto.randomUUID(), ...(m.questions ? { questions: m.questions.map(q => ({ ...q, options: [...q.options], id: crypto.randomUUID() })) } : {}) }; }
export type Assessment = {
    id: string;
    title: string;
    description: string;
    status: 'draft' | 'ready';
    modules: TestModule[];
    updatedAt: number;
    revision: number;
};
export type Answer = {
    choices?: Record<string, number>;
    text?: string;
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
    details?: {
        prompt: string;
        selected: string | null;
        answer: string;
        correct: boolean;
        explanation: string;
    }[];
};
export type Result = {
    objective: number | null;
    modules: ModuleScore[];
    writingWords: number;
    completedAt: number;
    timedOut: boolean;
};
export type Review = {
    ratings: Record<string, number>;
    notes: string;
    outcome: 'reviewed' | 'follow-up';
    reviewedAt: number;
};
export type Attempt = {
    id: string;
    assessmentId: string;
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
};
export const kindLabels: Record<ModuleKind, string> = { spelling: 'Message accuracy', grammar: 'Prioritisation & judgement', typing: 'Typing', problem: 'Investigation & policy', writing: 'Written response' };
export const rubric = [
    { id: 'accuracy', title: 'Policy & accuracy', help: 'Uses the facts correctly, protects customer data and avoids unsupported promises', anchors: ['Misstates policy or invents a commitment', 'Mostly correct; one material omission', 'Accurate, complete and safely within policy'] },
    { id: 'empathy', title: 'Empathy & tone', help: 'Acknowledges the specific concern respectfully without sounding dismissive', anchors: ['Dismissive or blames the customer', 'Polite, but generic acknowledgment', 'Specific acknowledgment and calm, respectful language'] },
    { id: 'clarity', title: 'Clear writing', help: 'Readable, concise and understandable; meaning matters more than dialect', anchors: ['Meaning is hard to follow', 'Understandable with some awkward phrasing', 'Easy to scan, concise and grammatically clear'] },
    { id: 'ownership', title: 'Ownership & next step', help: 'Explains what happens next, by whom and when', anchors: ['No useful next step', 'Useful action, but ownership or timing is vague', 'Clear action, owner and realistic follow-up timing'] },
];
export const duration = (mods: TestModule[]) => mods.reduce((n, m) => n + m.seconds, 0);
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
    if (duration(a.modules) > 600)
        return 'The assessment must take no more than 10 minutes.';
    for (const m of a.modules) {
        if (typeof m.id !== 'string' || ['constructor', 'prototype', '__proto__'].includes(m.id) || !/^[a-zA-Z0-9-]{1,60}$/.test(m.id) || !Object.keys(kindLabels).includes(m.kind))
            return 'Invalid module.';
        if (typeof m.title !== 'string' || !m.title.trim() || m.title.length > 120 || !Number.isInteger(m.seconds) || m.seconds < 15 || m.seconds > 600)
            return 'Each module needs a title and a time limit of 15–600 seconds.';
        if (typeof m.instructions !== 'string' || m.instructions.length > 2000 || (m.context !== undefined && (typeof m.context !== 'string' || m.context.length > 8000)))
            return 'Module instructions or context are too long.';
        if ((m.kind === 'typing' || m.kind === 'writing') && m.questions !== undefined)
            return 'Typing and writing modules cannot contain objective questions.';
        if (m.kind === 'typing') {
            if (typeof m.passage !== 'string' || m.passage.length < 100 || m.passage.length > 5000 || !Number.isFinite(m.targetWpm) || m.targetWpm! < 1 || m.targetWpm! > 200)
                return 'Typing needs a 100–5,000 character passage and a target of 1–200 WPM.';
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
        if (m.kind === 'writing')
            return { id: m.id, title: m.title, kind: m.kind, score: null };
        if (m.kind === 'typing')
            return { id: m.id, title: m.title, kind: m.kind, ...typingScore(a.text || '', m.passage || '', m.seconds, m.targetWpm) };
        const details = (m.questions || []).map(q => ({ prompt: q.prompt, selected: typeof a.choices?.[q.id] === 'number' ? q.options[a.choices[q.id]] ?? null : null, answer: q.options[q.correct], correct: a.choices?.[q.id] === q.correct, explanation: q.explanation }));
        const correct = details.filter(q => q.correct).length;
        return { id: m.id, title: m.title, kind: m.kind, score: details.length ? Math.round(correct / details.length * 100) : 0, correct, total: details.length, details };
    });
    const objective = scores.filter(s => s.score !== null);
    return { objective: objective.length ? Math.round(objective.reduce((n, s) => n + (s.score || 0), 0) / objective.length) : null, modules: scores, writingWords: modules.filter(m => m.kind === 'writing').reduce((n, m) => n + words(answers[m.id]?.text || ''), 0), completedAt, timedOut };
}
export function cleanModule(m: TestModule): TestModule { return { id: m.id, kind: m.kind, title: m.title, seconds: m.seconds, instructions: m.instructions, ...(m.context !== undefined ? { context: m.context } : {}), ...(m.questions ? { questions: m.questions.map(q => ({ id: q.id, prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation })) } : {}), ...(m.kind === 'typing' ? { passage: m.passage, targetWpm: m.targetWpm } : {}), ...(m.kind === 'writing' ? { prompt: m.prompt } : {}) }; }
export function candidateModule(m: TestModule) { return { id: m.id, kind: m.kind, title: m.title, seconds: m.seconds, instructions: m.instructions, context: m.context, prompt: m.kind === 'writing' ? m.prompt : undefined, passage: m.kind === 'typing' ? m.passage : undefined, questions: m.questions?.map(q => ({ id: q.id, prompt: q.prompt, options: q.options })) }; }
