import { createHash } from 'node:crypto';
import { rubric } from './assessment';
import type { Result, Review, TestModule, ModuleScore } from './assessment';

// Aggregation runs on the server. Snapshots, answers and review notes never
// become analytics payloads; clients receive counts and measured summaries.
export type AnalyticsPeriod = { period: string; from: number; until: number; fromDate: string; toDate: string };
export type AnalyticsAttempt = {
    id: string; assessment_id: string; status: string; created_at: number;
    started_at: number | null; deadline: number | null; expires_at: number; revoked: number;
    snapshot: { title: string; modules: TestModule[] }; result: Result | null; review: Review | null;
};
export type AnalyticsRequest = { id: string; column_id: string; assignee_id: string | null; priority: string; archived: boolean; created_at: number };
export type TrendPoint = { date: string; created: number; submitted: number; archived: number };
export type CountRow = { name: string; count: number };
export type AssessmentSummary = { id: string; title: string; links: number; submitted: number; awaiting: number; correct: number; total: number; accuracy: number | null };
export type ModuleSummary = { id: string; title: string; kind: string; version: string; samples: number; correct: number; total: number; accuracy: number | null; wpm: number | null; typingAccuracy: number | null; excluded: number; ceiling: number };
export type WritingSummary = { id: string; moduleTitle: string; version: string; title: string; samples: number; average: number; max: number };
export type AssessmentAnalytics = {
    links: number; submitted: number; completionRate: number | null; awaiting: number;
    correct: number; total: number; accuracy: number | null; medianSeconds: number | null;
    timedOut: number; trend: TrendPoint[]; granularity: string; pipeline: CountRow[];
    reviewOutcomes: CountRow[]; assessments: AssessmentSummary[]; modules: ModuleSummary[];
    writing: WritingSummary[]; typing: { samples: number; excluded: number; wpm: number | null; accuracy: number | null };
};
export type RequestAnalytics = {
    created: number; onBoard: number; unassigned: number; urgent: number; archived: number;
    medianAgeDays: number | null; columns: CountRow[]; priorities: CountRow[];
    workload: { name: string; count: number; urgent: number; ageDays: number | null }[];
    trend: TrendPoint[]; granularity: string;
};
export type AnalyticsResponse = {
    tenantId: string; generatedAt: number; range: AnalyticsPeriod;
    assessmentOptions: { id: string; title: string }[];
    assessments?: AssessmentAnalytics; requests?: RequestAnalytics;
};
const day = 86400000;
export const utcDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 10) / 10;
const percent = (n: number, d: number) => d ? round(n / d * 100) : null;
export function median(values: number[]): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}
export function analyticsPeriod(params: URLSearchParams, now: number): AnalyticsPeriod {
    const period = params.get('period') || '30', today = utcDate(now), midnight = Date.parse(today);
    let from = 0, until = midnight + day, fromDate = '';
    if (['30', '90', '365'].includes(period)) from = midnight - (Number(period) - 1) * day;
    else if (period === 'custom') {
        const start = params.get('from') || '', end = params.get('to') || '';
        const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && utcDate(Date.parse(value)) === value && value >= '2000-01-01' && value <= today;
        if (!valid(start) || !valid(end) || start > end) throw new Error('Choose a valid date range ending today or earlier.');
        from = Date.parse(start); until = Date.parse(end) + day;
    } else if (period !== 'all') throw new Error('Choose a valid period.');
    if (from) fromDate = utcDate(from);
    return { period, from, until, fromDate, toDate: utcDate(until - day) };
}
function cohort<T extends { created_at: number }>(rows: T[], range: AnalyticsPeriod, now: number) {
    return rows.filter(row => row.created_at >= range.from && row.created_at < range.until && row.created_at <= now);
}
function trend(rows: { created_at: number; submitted?: boolean; archived?: boolean }[], range: AnalyticsPeriod) {
    if (!rows.length) return { trend: [] as TrendPoint[], granularity: 'day' };
    const start = range.from || Date.parse(utcDate(rows.reduce((oldest, row) => Math.min(oldest, row.created_at), Infinity)));
    const span = Math.ceil((range.until - start) / day), granularity = span <= 62 ? 'day' : span <= 366 ? 'week' : 'month';
    const key = (time: number) => granularity === 'month' ? utcDate(time).slice(0, 7) + '-01' : utcDate(start + Math.floor((time - start) / (granularity === 'week' ? 7 * day : day)) * (granularity === 'week' ? 7 * day : day));
    const buckets = new Map<string, TrendPoint>();
    for (let cursor = start; cursor < range.until;) {
        const date = key(cursor); buckets.set(date, { date, created: 0, submitted: 0, archived: 0 });
        cursor = granularity === 'month' ? Date.UTC(new Date(cursor).getUTCFullYear(), new Date(cursor).getUTCMonth() + 1, 1) : cursor + (granularity === 'week' ? 7 * day : day);
    }
    for (const row of rows) { const point = buckets.get(key(row.created_at))!; point.created++; if (row.submitted) point.submitted++; if (row.archived) point.archived++; }
    return { trend: [...buckets.values()], granularity };
}
function objective(result: Result | null) {
    const modules = result?.modules.filter(m => ['questions', 'spelling', 'grammar', 'problem'].includes(m.kind) && Number.isFinite(m.correct) && Number.isFinite(m.total) && m.total! > 0 && m.correct! >= 0 && m.correct! <= m.total!) || [];
    return { correct: modules.reduce((sum, m) => sum + m.correct!, 0), total: modules.reduce((sum, m) => sum + m.total!, 0) };
}
function typingUsable(score: ModuleScore) {
    // Legacy typing can still be summarised; interrupted and not-attempted
    // measured tasks cannot be treated as genuine speed observations.
    return (!score.administration || score.administration === 'Measured') && Number.isFinite(score.netWpm) && score.netWpm! >= 0 && Number.isFinite(score.accuracy) && score.accuracy! >= 0 && score.accuracy! <= 100 && Number.isFinite(score.seconds) && score.seconds! > 0;
}
function fingerprint(module: TestModule) {
    const { id: _id, questionIndex: _index, questionCount: _count, ...content } = module;
    void _id; void _index; void _count;
    const semantic = { ...content, questions: module.questions?.map(q => ({ prompt: q.prompt, context: q.context, options: [...q.options].sort(), answer: q.correctOptionId && q.optionIds ? q.options[q.optionIds.indexOf(q.correctOptionId)] : q.options[q.correct], explanation: q.explanation })) };
    const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
    return createHash('sha256').update(JSON.stringify(canonical(semantic))).digest('hex');
}
export function assessmentAnalytics(input: AnalyticsAttempt[], tests: { id: string; title: string }[], range: AnalyticsPeriod, now: number): AssessmentAnalytics {
    const rows = cohort(input, range, now), completed = rows.filter(a => a.status === 'completed');
    const needsReview = (a: AnalyticsAttempt) => a.snapshot.modules.some(m => m.kind === 'writing');
    const awaiting = completed.filter(a => needsReview(a) && !a.review).length;
    const scores = completed.map(a => objective(a.result));
    const correct = scores.reduce((n, score) => n + score.correct, 0), total = scores.reduce((n, score) => n + score.total, 0);
    const pipeline = ['Not started', 'In progress', 'Submitted', 'Expired', 'Revoked', 'Awaiting finalisation'].map(name => ({ name, count: 0 }));
    for (const a of rows) {
        const index = a.status === 'completed' ? 2 : a.revoked ? 4 : a.status === 'in-progress' ? (a.deadline !== null && a.deadline <= now ? 5 : 1) : a.expires_at <= now ? 3 : 0;
        pipeline[index].count++;
    }
    const reviewOutcomes = [{ name: 'Awaiting scores', count: awaiting }, ...(['reviewed', 'follow-up', 'not-scorable'] as const).map((outcome, i) => ({ name: ['Reviewed', 'Follow-up', 'Not scorable'][i], count: completed.filter(a => needsReview(a) && a.review?.outcome === outcome).length }))];
    const testsById = new Map(tests.map(test => [test.id, test.title]));
    const groups = new Map<string, AssessmentSummary>();
    const modules = new Map<string, ModuleSummary & { wpms: number[]; accuracies: number[] }>();
    const writing = new Map<string, WritingSummary & { sum: number }>();
    for (const a of rows) {
        const group = groups.get(a.assessment_id) || { id: a.assessment_id, title: testsById.get(a.assessment_id) || a.snapshot.title, links: 0, submitted: 0, awaiting: 0, correct: 0, total: 0, accuracy: null };
        group.links++; if (a.status === 'completed') { group.submitted++; if (needsReview(a) && !a.review) group.awaiting++; const score = objective(a.result); group.correct += score.correct; group.total += score.total; }
        groups.set(a.assessment_id, group);
        if (a.status !== 'completed' || !a.result) continue;
        for (const m of a.snapshot.modules) {
            const score = a.result.modules.find(s => s.id === m.id); if (!score) continue;
            const id = fingerprint(m), version = `${m.code ? m.code + ' · ' : ''}v${m.version || 1} · ${id.slice(0, 6)}`;
            const summary = modules.get(id) || { id, title: m.title, kind: m.kind, version, samples: 0, correct: 0, total: 0, accuracy: null, wpm: null, typingAccuracy: null, excluded: 0, ceiling: 0, wpms: [], accuracies: [] };
            if (m.kind === 'typing') {
                if (typingUsable(score)) { summary.samples++; summary.wpms.push(score.netWpm!); summary.accuracies.push(score.accuracy!); if (score.ceiling) summary.ceiling++; }
                else summary.excluded++;
            } else if (m.kind === 'writing') {
                if (a.review && a.review.outcome !== 'not-scorable') {
                    // Criteria are taken from each assigned snapshot, never from
                    // the current editable module library.
                    const criteria = m.rubric || rubric.map(criterion => ({ ...criterion, max: 4 }));
                    for (const criterion of criteria) {
                        const rating = a.review.ratings[m.rubric ? `${m.id}:${criterion.id}` : criterion.id];
                        if (!Number.isFinite(rating) || rating < 0 || rating > criterion.max) continue;
                        const key = id + ':' + criterion.id;
                        const row = writing.get(key) || { id: key, moduleTitle: m.title, version, title: criterion.title, samples: 0, average: 0, max: criterion.max, sum: 0 };
                        row.samples++; row.sum += rating; writing.set(key, row);
                    }
                }
            } else {
                const value = objective({ ...a.result, modules: [score] });
                if (value.total) { summary.samples++; summary.correct += value.correct; summary.total += value.total; }
            }
            modules.set(id, summary);
        }
    }
    const typingModules = [...modules.values()].filter(m => m.kind === 'typing');
    return { links: rows.length, submitted: completed.length, completionRate: percent(completed.length, rows.length), awaiting, correct, total, accuracy: percent(correct, total),
        medianSeconds: median(completed.flatMap(a => a.started_at !== null && a.result && a.result.completedAt >= a.started_at && a.result.completedAt <= now ? [(a.result.completedAt - a.started_at) / 1000] : [])),
        timedOut: completed.filter(a => a.result?.timedOut).length, pipeline, reviewOutcomes,
        assessments: [...groups.values()].map(g => ({ ...g, accuracy: percent(g.correct, g.total) })).sort((a, b) => b.links - a.links || a.title.localeCompare(b.title)),
        modules: [...modules.values()].filter(m => m.kind !== 'writing').map(({ wpms, accuracies, ...m }) => ({ ...m, accuracy: percent(m.correct, m.total), wpm: median(wpms), typingAccuracy: median(accuracies) })).sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
        writing: [...writing.values()].map(({ sum, ...w }) => ({ ...w, average: round(sum / w.samples) })).sort((a, b) => a.moduleTitle.localeCompare(b.moduleTitle) || a.version.localeCompare(b.version) || a.title.localeCompare(b.title)),
        typing: { samples: typingModules.reduce((sum, m) => sum + m.samples, 0), excluded: typingModules.reduce((sum, m) => sum + m.excluded, 0), wpm: median(typingModules.flatMap(m => m.wpms)), accuracy: median(typingModules.flatMap(m => m.accuracies)) },
        ...trend(rows.map(a => ({ created_at: a.created_at, submitted: a.status === 'completed' })), range),
    };
}
export function requestAnalytics(input: AnalyticsRequest[], columns: { id: string; name: string }[], users: { id: string; name: string; status: string }[], range: AnalyticsPeriod, now: number): RequestAnalytics {
    const rows = cohort(input, range, now), active = rows.filter(r => !r.archived), ages = (items: AnalyticsRequest[]) => items.map(r => (now - r.created_at) / day);
    const names = new Map(users.map(u => [u.id, u.name + (u.status === 'active' ? '' : ' (inactive)')]));
    const groups = new Map<string, AnalyticsRequest[]>();
    for (const row of active) { const key = row.assignee_id || ''; const group = groups.get(key) || []; group.push(row); groups.set(key, group); }
    const high = (r: AnalyticsRequest) => r.priority === 'high' || r.priority === 'urgent';
    return { created: rows.length, onBoard: active.length, archived: rows.length - active.length, unassigned: active.filter(r => !r.assignee_id).length, urgent: active.filter(high).length, medianAgeDays: median(ages(active)),
        columns: columns.map(c => ({ name: c.name, count: active.filter(r => r.column_id === c.id).length })),
        priorities: ['urgent', 'high', 'normal', 'low'].map(name => ({ name: name[0].toUpperCase() + name.slice(1), count: active.filter(r => r.priority === name).length })),
        workload: [...groups].map(([id, cards]) => ({ name: id ? names.get(id) || 'Former team member' : 'Unassigned', count: cards.length, urgent: cards.filter(high).length, ageDays: median(ages(cards)) })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        ...trend(rows.map(r => ({ created_at: r.created_at, archived: r.archived })), range),
    };
}
