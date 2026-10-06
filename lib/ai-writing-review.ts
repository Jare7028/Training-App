import 'server-only';
import { after } from 'next/server';
import { serviceClient } from '@/lib/supabase/admin';
import { gradingInstructions, parseScoringResponse, scoringInput, scoringSchema, validatedWritingReview, writingModel } from '@/lib/writing-scoring';
import type { Assessment, Answer, Review } from '@/lib/assessment';
import type { RecordRow } from '@/db/store';

type Job = {state?: string; tries?: number; claim?: string; startedAt?: number; retryAt?: number; error?: string};
const object = <T,>(value: unknown): T => typeof value === 'string' ? JSON.parse(value) : value as T;
export const aiConfigured = () => !!process.env.OPENAI_API_KEY;
function providerUrl() {
    const test = process.env.AI_SCORING_TEST_URL;
    if (test) {
        if (!/^http:\/\/127\.0\.0\.1:\d+\/responses$/.test(test) ||
            !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || '') ||
            process.env.OPENAI_API_KEY !== 'synthetic-local-scoring-only') throw new Error('configuration');
        return test;
    }
    return 'https://api.openai.com/v1/responses';
}
export function needsAiScore(row: RecordRow, now = Date.now()) {
    if (row.status !== 'completed' || row.demo || row.preview || row.review) return false;
    const snapshot = object<Assessment>(row.snapshot);
    if (!snapshot.modules.some(m => m.kind === 'writing')) return false;
    const job = object<Job>(row.ai_scoring || {});
    if (job.state === 'completed') return false;
    if (job.state === 'blocked') return aiConfigured();
    if (job.state === 'running') return (job.tries || 0) < 3 && now - (job.startedAt || 0) > 120000;
    return (job.tries || 0) < 3 && (!job.retryAt || job.retryAt <= now);
}

async function scoreOne(id: string, owner?: string, force = false) {
    const db = serviceClient();
    let lookup = db.from('attempts').select('*').eq('id', id).eq('demo', 0).eq('status', 'completed');
    if (owner) lookup = lookup.eq('owner', owner);
    const {data: row, error} = await lookup.maybeSingle();
    if (error || !row || (!force && !needsAiScore(row))) return;
    const previousJob = object<Job>(row.ai_scoring || {});
    if (previousJob.state === 'running' && Date.now() - (previousJob.startedAt || 0) <= 120000) return;
    const input = scoringInput(object<Assessment>(row.snapshot), object<Record<string, Answer>>(row.answers));
    if (!input.criteria.length) return;
    const claim = crypto.randomUUID();
    const configured = aiConfigured();
    const job: Job = {state: configured ? 'running' : 'blocked', claim, tries: configured ? (force ? 1 : (previousJob.tries || 0) + 1) : 0, startedAt: Date.now()};
    // JSON equality prevents duplicate job claims. Revision CAS protects review
    // edits made while the model is running; scoring never alters saved answers.
    const {data: claimed, error: claimError} = await db.from('attempts').update({ai_scoring: job})
        .eq('id', id).eq('owner', row.owner).eq('revision', row.revision)
        .eq('ai_scoring', JSON.stringify(row.ai_scoring)).select('id');
    if (claimError || !claimed?.length || !configured) return;
    try {
        let review: Review;
        if (input.tasks.every(t => !t.response.trim())) {
            review = validatedWritingReview({summary: 'No written responses were submitted.', ratings: input.criteria.map(c => ({key: c.key, score: 0, reason: 'No written response was submitted.', evidence: []}))}, input, Date.now());
        } else {
            const response = await fetch(providerUrl(), {
                method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}`},
                signal: AbortSignal.timeout(90000), cache: 'no-store',
                body: JSON.stringify({model: writingModel, store: false, reasoning: {effort: 'low'},
                    instructions: gradingInstructions, input: [{role: 'user', content: JSON.stringify(input)}],
                    max_output_tokens: 10000, text: {format: {type: 'json_schema', name: 'writing_rubric_score', strict: true, schema: scoringSchema(input.criteria.map(c => c.key))}}}),
            });
            if (!response.ok) throw new Error(response.status === 401 ? 'configuration' : response.status === 429 ? 'capacity' : response.status === 404 ? 'model_unavailable' : 'provider_unavailable');
            review = validatedWritingReview(parseScoringResponse(await response.json()), input, Date.now());
        }
        const previous: Review | null = row.review ? object(row.review) : null;
        if (previous) { const {history, ...entry} = previous; review.history = [...(history || []), entry]; }
        const {data: saved, error: saveError} = await db.from('attempts').update({review, revision: Number(row.revision) + 1,
            ai_scoring: {...job, state: 'completed'}})
            .eq('id', id).eq('owner', row.owner).eq('revision', row.revision).eq('ai_scoring->>claim', claim).select('id');
        if (saveError) throw new Error('save_failed');
        if (!saved?.length) await db.from('attempts').update({ai_scoring: {...job, state: 'failed', error: 'changed', retryAt: Date.now() + 10000}}).eq('id', id).eq('ai_scoring->>claim', claim);
    } catch (error) {
        const code = error instanceof Error && ['configuration','capacity','model_unavailable','provider_unavailable','invalid_output','refused','save_failed'].includes(error.message) ? error.message : 'interrupted';
        // Never log model responses, candidate text or API credentials.
        await db.from('attempts').update({ai_scoring: {...job, state: 'failed', error: code, retryAt: Date.now() + (job.tries === 1 ? 10000 : 60000)}}).eq('id', id).eq('ai_scoring->>claim', claim);
    }
}

export function scheduleWritingScores(rows: RecordRow[]) {
    const ids = rows.filter(row => needsAiScore(row)).slice(0, 3).map(row => ({id: String(row.id), owner: String(row.owner)}));
    if (ids.length) after(async () => { await Promise.all(ids.map(({id, owner}) => scoreOne(id, owner).catch(() => undefined))); });
}
export function scheduleWritingScore(id: string, owner: string, force = false) {
    after(async () => { await scoreOne(id, owner, force).catch(() => undefined); });
}
