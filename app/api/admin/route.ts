import { template } from '@/lib/templates';
import { kindLabels, ModuleKind } from '@/lib/assessment';
import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/request-origin';
import { getAssessmentAdmin } from '@/app/admin-auth';
import { allRows, firstRow, insertRow, updateRows, deleteExpiredPreviews, hashToken, RecordRow } from '@/db/store';
import { Assessment, validateAssessment, scoreAttempt, reviewCriteria, Review, TestModule, cleanModule, withTypingAdministration } from '@/lib/assessment';
import { canEdit } from '@/lib/permissions';
import { updateRows as completeExpiredAttempt } from '@/db/privileged-store';
import { aiConfigured, scheduleWritingScore, scheduleWritingScores } from '@/lib/ai-writing-review';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function assessment(r: RecordRow): Assessment { return withTypingAdministration({ id: String(r.id), title: String(r.title), description: String(r.description), status: r.status as Assessment['status'], modules: JSON.parse(String(r.modules)), updatedAt: Number(r.updated_at), revision: Number(r.revision), config: r.config ? JSON.parse(String(r.config)) : undefined }); }
function scoringStatus(value: unknown) {
    const job = (value || {}) as {state?: string; tries?: number; retryAt?: number; error?: string; startedAt?: number};
    const stale = job.state === 'running' && Date.now() - (job.startedAt || 0) > 120000;
    return {state: stale ? 'failed' : job.state, tries: job.tries, retryAt: job.retryAt, error: stale ? 'interrupted' : job.error, startedAt: job.startedAt};
}
function attempt(r: RecordRow) { const snapshot = JSON.parse(String(r.snapshot)); return { id: r.id, assessmentId: r.assessment_id, title: snapshot.title, alias: r.alias, status: r.status, createdAt: r.created_at, startedAt: r.started_at, deadline: r.deadline, completedAt: r.result ? JSON.parse(String(r.result)).completedAt : null, modules: snapshot.modules, config: snapshot.config, answers: JSON.parse(String(r.answers)), result: r.result ? JSON.parse(String(r.result)) : null, review: r.review ? JSON.parse(String(r.review)) : null, aiScoring: scoringStatus(r.ai_scoring), hiring: r.hiring ? JSON.parse(String(r.hiring)) : {stage:'Unassigned',notes:'',revision:0}, expiresAt: r.expires_at, revoked: !!r.revoked, revision: r.revision }; }
export async function GET(request: Request) {
    try {
        const user = await getAssessmentAdmin();
        const requestedTenant = request.headers.get('x-tenant-id');
        if (user && requestedTenant && requestedTenant !== user.tenantId) return json({ error: 'The selected business changed. Reload before continuing.' }, 409);
        if (!user)
            return json({ error: 'Sign in to open your assessment workspace.' }, 401);
        const [tests, rows, library, links] = await Promise.all([allRows('assessments', { owner: user.workspaceOwner }, { order: 'updated_at' }), allRows('attempts', { owner: user.workspaceOwner, demo: 0 }, { order: 'created_at', complete: true }), allRows('modules', { owner: user.workspaceOwner }, { order: 'updated_at' }), allRows('general_links', {owner:user.workspaceOwner}, {order:'created_at',complete:true})]);
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.status === 'in-progress' && Number(row.deadline) + 2500 <= Date.now()) {
                const snapshot = JSON.parse(String(row.snapshot));
                const result = scoreAttempt(snapshot.modules, JSON.parse(String(row.answers)), Number(row.deadline), true);
                const update = await completeExpiredAttempt('attempts', { status: 'completed', result: JSON.stringify(result), revision: Number(row.revision) + 1 }, { id: row.id, owner: user.workspaceOwner, revision: row.revision, status: 'in-progress' });
                if (update) {
                    row.status = 'completed';
                    row.result = JSON.stringify(result);
                    row.revision = Number(row.revision) + 1;
                }
                else
                    rows[i] = (await firstRow('attempts', { id: row.id, owner: user.workspaceOwner })) || row;
            }
        }
        if (canEdit(user.role)) scheduleWritingScores(rows);
        return json({ aiConfigured: aiConfigured(), generalLinks: canEdit(user.role) ? links.map(r=>({id:r.id,assessmentId:r.assessment_id,createdAt:r.created_at,expiresAt:r.expires_at,revoked:!!r.revoked,path:`/join/${r.share_token}`})) : [], presets: Object.keys(kindLabels).filter(k => k !== 'questions').map(k => template(k as ModuleKind)), assessments: tests.map(assessment), attempts: rows.map(attempt), library: library.map(r => ({ id: r.id, module: JSON.parse(String(r.content)), revision: r.revision, updatedAt: r.updated_at })), user: user.displayName, role: user.role, userId: user.userId });
    }
    catch (e) {
        console.error('Admin load', e);
        return json({ error: 'Your workspace could not be loaded. Please retry.' }, 503);
    }
}
export async function POST(request: Request) {
    try {
        const user = await getAssessmentAdmin();
        const requestedTenant = request.headers.get('x-tenant-id');
        if (user && requestedTenant && requestedTenant !== user.tenantId) return json({ error: 'The selected business changed. Reload before continuing.' }, 409);
        if (!user)
            return json({ error: 'Sign in to continue.' }, 401);
        if (!canEdit(user.role)) return json({ error: 'Your Viewer role has read-only access.' }, 403);
        if (!sameOrigin(request))
            return json({ error: 'Invalid request origin.' }, 403);
        if (Number(request.headers.get('content-length') || 0) > 150000)
            return json({ error: 'Request is too large.' }, 413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 150000)
            return json({ error: 'Request is too large.' }, 413);
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            return json({ error: 'Invalid JSON.' }, 400);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return json({ error: 'Invalid request.' }, 400);
        const body = parsed as {
            action: string;
            assessment: Assessment;
            module: TestModule;
            id: string;
            alias: string;
            revision: number;
            review: Review;
            extraSeconds?: number;
            hiring?: {stage:string;notes:string;revision:number};
        };
        const owner = user.workspaceOwner;
        const now = Date.now();
        if (body.action === 'save-module') {
            const contentModule = body.module;
            const error = validateAssessment({ id: '', title: 'Module', description: '', status: 'ready', modules: [contentModule], updatedAt: now, revision: 1 }, true);
            if (error) return json({ error }, 400);
            const content = JSON.stringify({ ...cleanModule(contentModule), ...(contentModule.code ? {version: body.id ? Number(body.revision) + 1 : 1} : {}) });
            if (body.id) {
                const row = await firstRow('modules', { id: String(body.id), owner });
                if (!row) return json({ error: 'Module not found.' }, 404);
                if (row.revision !== body.revision) return json({ error: 'This module changed in another tab. Reload before saving.' }, 409);
                const update = await updateRows('modules', { content, updated_at: now, revision: body.revision + 1 }, { id: body.id, owner, revision: body.revision });
                if (!update) return json({ error: 'This module changed. Reload before saving.' }, 409);
                return json({ id: body.id });
            }
            const id = crypto.randomUUID();
            await insertRow('modules', { id, owner, content, updated_at: now, revision: 1 });
            return json({ id });
        }
        if (body.action === 'hiring') {
            const decision = body.hiring;
            if (!decision || typeof decision.stage !== 'string' || !decision.stage.trim() || decision.stage.length > 50 || typeof decision.notes !== 'string' || decision.notes.length > 5000 || !Number.isInteger(decision.revision) || decision.revision < 0 || decision.revision >= 999999999) return json({error:'Choose a hiring stage (up to 50 characters) and notes under 5,000 characters.'},400);
            const row = await firstRow('attempts', {id:String(body.id),owner});
            if (!row) return json({error:'Candidate not found.'},404);
            const hiring = {stage:decision.stage.trim(),notes:decision.notes.trim(),revision:decision.revision+1,updatedAt:now,updatedBy:user.loginName};
            const count = await updateRows('attempts',{hiring:JSON.stringify(hiring)},{id:row.id,owner,'hiring->>revision':String(decision.revision)});
            if (!count) return json({error:'The hiring notes changed in another tab. Refresh before saving.'},409);
            return json({hiring});
        }
        if (body.action === 'close-general-link') {
            const count=await updateRows('general_links',{revoked:1},{id:String(body.id),owner});
            if(!count)return json({error:'General link not found.'},404);
            return json({ok:true});
        }
        if (body.action === 'revoke') {
            const update = await updateRows('attempts', { revoked: 1, revision: body.revision + 1 }, { id: String(body.id), owner, revision: body.revision });
            if (!update) return json({ error: 'Attempt not found or changed. Refresh before retrying.' }, 409);
            return json({ ok: true });
        }
        if (body.action === 'save') {
            let a = body.assessment as Assessment;
            if (!a || !['draft', 'ready'].includes(a.status))
                return json({ error: 'Invalid assessment.' }, 400);
            const error = validateAssessment(a, a.status === 'ready');
            if (error)
                return json({ error }, 400);
            a = withTypingAdministration(a);
            a.modules = a.modules.map(m => ({ ...cleanModule(m), ...(m.code ? {version: Number(a.revision || 0) + 1} : {}) }));
            const existing = a.id ? await firstRow('assessments', { id: a.id, owner }) : null;
            if (a.id && !existing) return json({ error: 'Assessment not found.' }, 404);
            if (existing) {
                if (existing.revision !== a.revision)
                    return json({ error: 'This test changed in another tab. Reload it before saving.' }, 409);
                const r = await updateRows('assessments', { title: a.title.trim(), description: a.description, status: a.status, modules: JSON.stringify(a.modules), config: a.config ? JSON.stringify(a.config) : null, updated_at: now, revision: a.revision + 1 }, { id: a.id, owner, revision: a.revision });
                if (!r)
                    return json({ error: 'This test changed. Reload before saving.' }, 409);
                return json({ id: a.id });
            }
            const id = crypto.randomUUID();
            await insertRow('assessments', { id, owner, title: a.title.trim(), description: a.description, status: a.status, modules: JSON.stringify(a.modules), config: a.config ? JSON.stringify(a.config) : null, updated_at: now, revision: 1 });
            return json({ id });
        }
        if (body.action === 'general-link' || body.action === 'link' || body.action === 'preview' || body.action === 'preview-unsaved') {
            const general = body.action === 'general-link';
            const preview = !general && body.action !== 'link';
            if (!preview && !general && (typeof body.alias !== 'string' || !body.alias.trim() || body.alias.length > 80))
                return json({ error: 'Add a candidate name or reference (up to 80 characters).' }, 400);
            const unsaved = body.action === 'preview-unsaved';
            const sourceId = unsaved ? body.assessment?.id : body.id;
            const row = sourceId ? await firstRow('assessments', { id: String(sourceId), owner }) : null;
            if ((!unsaved || sourceId) && !row)
                return json({ error: 'Assessment not found.' }, 404);
            let test: Assessment;
            if (unsaved) {
                const error = validateAssessment(body.assessment, true);
                if (error) return json({ error }, 400);
                test = withTypingAdministration({ ...body.assessment, status: 'ready', modules: body.assessment.modules.map(cleanModule) });
            } else test = assessment(row!);
            if (body.extraSeconds !== undefined && (!Number.isInteger(body.extraSeconds) || body.extraSeconds < 0 || body.extraSeconds > 86400 || !test.config?.flexible)) return json({ error: 'Extra time requires a shared-timer assessment (0–86,400 seconds).' }, 400);
            if (test.config && body.extraSeconds) test.config = { ...test.config, workSeconds: test.config.workSeconds + body.extraSeconds, adjustmentSeconds: body.extraSeconds };
            if (test.status !== 'ready')
                return json({ error: 'Mark the test ready before creating a link.' }, 400);
            const id = crypto.randomUUID();
            const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
            if (general) {
                await insertRow('general_links',{id,owner,assessment_id:row!.id,share_token:token,snapshot:JSON.stringify(test),created_at:now,expires_at:now+(test.config?.linkExpiryDays??7)*86400000,revoked:0});
                return json({id,path:`/join/${token}`});
            }
            const table = preview ? 'preview_attempts' : 'attempts';
            await deleteExpiredPreviews(owner, now);
            await insertRow(table, { id, owner, assessment_id: row?.id ?? null, token_hash: await hashToken(token), alias: preview ? 'Preview' : body.alias.trim(), snapshot: JSON.stringify(test), status: 'not-started', created_at: now, answers: '{}', demo: 0, revision: 1, expires_at: now + (preview ? 3600000 : (test.config?.linkExpiryDays ?? 7) * 86400000), revoked: 0 });
            return json({ id, path: `/take/${token}` });
        }
        if (body.action === 'ai-score') {
            const row = await firstRow('attempts', {id: String(body.id), owner});
            if (!row) return json({error: 'Result not found.'}, 404);
            if (row.status !== 'completed') return json({error: 'Wait until the assessment is submitted.'}, 400);
            if (row.revision !== body.revision) return json({error: 'The result changed. Reload before scoring.'}, 409);
            if (!aiConfigured()) return json({error: 'The OpenAI API key is not configured.'}, 503);
            if (!JSON.parse(String(row.snapshot)).modules.some((m: TestModule) => m.kind === 'writing')) return json({error: 'No written responses to score.'}, 400);
            const job = row.ai_scoring as {state?: string; startedAt?: number};
            if (job?.state === 'running' && now - (job.startedAt || 0) <= 120000) return json({error: 'Written responses are already being scored.'}, 409);
            scheduleWritingScore(String(row.id), owner, true);
            return json({ok: true}, 202);
        }
        if (body.action === 'review') {
            const row = await firstRow('attempts', { id: String(body.id), owner });
            if (!row)
                return json({ error: 'Result not found.' }, 404);
            if (row.status !== 'completed')
                return json({ error: 'Wait until the assessment is submitted.' }, 400);
            if (row.revision !== body.revision)
                return json({ error: 'The review changed in another tab. Reload it before saving.' }, 409);
            const review = body.review;
            if (!review || !['reviewed', 'follow-up', 'not-scorable'].includes(review.outcome) || typeof review.notes !== 'string' || review.notes.trim().length < 5 || review.notes.length > 5000)
                return json({ error: 'Add an evidence-based review note (5–5,000 characters).' }, 400);
            const snapshot = JSON.parse(String(row.snapshot));
            const criteria = reviewCriteria(snapshot.modules);
            if (review.outcome !== 'not-scorable' && criteria.some(r => !Number.isInteger(review.ratings?.[r.key]) || review.ratings[r.key] < 0 || review.ratings[r.key] > r.max)) return json({ error: 'Rate each writing criterion using its displayed scale.' }, 400);
            if (review.outcome !== 'not-scorable' && criteria.some(r => r.key.includes(':') && (typeof review.evidence?.[r.key] !== 'string' || !review.evidence[r.key].trim() || review.evidence[r.key].length > 2000))) return json({ error: 'Add evidence for each writing criterion.' }, 400);
            const previous: Review | null = row.review ? JSON.parse(String(row.review)) : null;
            const { history: oldHistory, ...previousEntry } = previous || {};
            const clean = { ratings: review.outcome === 'not-scorable' ? {} : Object.fromEntries(criteria.filter(r => typeof review.ratings?.[r.key] === 'number').map(r => [r.key, review.ratings[r.key]])), evidence: Object.fromEntries(criteria.filter(r => typeof review.evidence?.[r.key] === 'string').map(r => [r.key, review.evidence![r.key].trim()])), notes: review.notes.trim(), source: 'human', outcome: review.outcome, reviewedAt: now, reviewer: user.loginName, history: previous ? [...(oldHistory || []), previousEntry] : [] };
            const r = await updateRows('attempts', { review: JSON.stringify(clean), revision: body.revision + 1 }, { id: body.id, owner, revision: body.revision });
            if (!r)
                return json({ error: 'This review changed. Reload before saving.' }, 409);
            return json({ ok: true });
        }
        return json({ error: 'Unknown action.' }, 400);
    }
    catch (e) {
        console.error('Admin mutation', e);
        return json({ error: 'We could not save that change. Your input is still here; please retry.' }, 503);
    }
}
