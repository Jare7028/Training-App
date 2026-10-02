import { template } from '@/lib/templates';
import { kindLabels, ModuleKind } from '@/lib/assessment';
import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/request-origin';
import { getAssessmentAdmin } from '@/app/admin-auth';
import { allRows, firstRow, insertRow, updateRows, deleteExpiredPreviews, hashToken, RecordRow } from '@/db/store';
import { Assessment, validateAssessment, scoreAttempt, reviewCriteria, Review, TestModule, cleanModule, withTypingAdministration } from '@/lib/assessment';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function assessment(r: RecordRow): Assessment { return withTypingAdministration({ id: String(r.id), title: String(r.title), description: String(r.description), status: r.status as Assessment['status'], modules: JSON.parse(String(r.modules)), updatedAt: Number(r.updated_at), revision: Number(r.revision), config: r.config ? JSON.parse(String(r.config)) : undefined }); }
function attempt(r: RecordRow) { const snapshot = JSON.parse(String(r.snapshot)); return { id: r.id, assessmentId: r.assessment_id, title: snapshot.title, alias: r.alias, status: r.status, createdAt: r.created_at, startedAt: r.started_at, deadline: r.deadline, completedAt: r.result ? JSON.parse(String(r.result)).completedAt : null, modules: snapshot.modules, config: snapshot.config, answers: JSON.parse(String(r.answers)), result: r.result ? JSON.parse(String(r.result)) : null, review: r.review ? JSON.parse(String(r.review)) : null, expiresAt: r.expires_at, revoked: !!r.revoked, revision: r.revision }; }
export async function GET() {
    try {
        const user = await getAssessmentAdmin();
        if (!user)
            return json({ error: 'Sign in to open your assessment workspace.' }, 401);
        const [tests, rows, library] = await Promise.all([allRows('assessments', { owner: user.userId }, { order: 'updated_at' }), allRows('attempts', { owner: user.userId, demo: 0 }, { order: 'created_at', limit: 200 }), allRows('modules', { owner: user.userId }, { order: 'updated_at' })]);
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.status === 'in-progress' && Number(row.deadline) + 2500 <= Date.now()) {
                const snapshot = JSON.parse(String(row.snapshot));
                const result = scoreAttempt(snapshot.modules, JSON.parse(String(row.answers)), Number(row.deadline), true);
                const update = await updateRows('attempts', { status: 'completed', result: JSON.stringify(result), revision: Number(row.revision) + 1 }, { id: row.id, owner: user.userId, revision: row.revision, status: 'in-progress' });
                if (update) {
                    row.status = 'completed';
                    row.result = JSON.stringify(result);
                    row.revision = Number(row.revision) + 1;
                }
                else
                    rows[i] = (await firstRow('attempts', { id: row.id, owner: user.userId })) || row;
            }
        }
        return json({ presets: Object.keys(kindLabels).map(k => template(k as ModuleKind)), assessments: tests.map(assessment), attempts: rows.map(attempt), library: library.map(r => ({ id: r.id, module: JSON.parse(String(r.content)), revision: r.revision, updatedAt: r.updated_at })), user: user.displayName });
    }
    catch (e) {
        console.error('Admin load', e);
        return json({ error: 'Your workspace could not be loaded. Please retry.' }, 503);
    }
}
export async function POST(request: Request) {
    try {
        const user = await getAssessmentAdmin();
        if (!user)
            return json({ error: 'Sign in to continue.' }, 401);
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
        };
        const owner = user.userId;
        const now = Date.now();
        if (body.action === 'save-module') {
            const contentModule = body.module;
            const error = validateAssessment({ id: '', title: contentModule?.title, description: '', status: 'ready', modules: [contentModule], updatedAt: now, revision: 1 }, true);
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
        if (body.action === 'link' || body.action === 'preview') {
            const preview = body.action === 'preview';
            if (!preview && (typeof body.alias !== 'string' || !body.alias.trim() || body.alias.length > 80))
                return json({ error: 'Add a candidate name or reference (up to 80 characters).' }, 400);
            const row = await firstRow('assessments', { id: String(body.id), owner });
            if (!row)
                return json({ error: 'Assessment not found.' }, 404);
            const test = assessment(row);
            if (body.extraSeconds !== undefined && (!Number.isInteger(body.extraSeconds) || body.extraSeconds < 0 || body.extraSeconds > 1800 || !test.config?.flexible)) return json({ error: 'Extra time requires a shared-timer assessment (0–1,800 seconds).' }, 400);
            if (test.config && body.extraSeconds) test.config = { ...test.config, workSeconds: test.config.workSeconds + body.extraSeconds, adjustmentSeconds: body.extraSeconds };
            if (test.status !== 'ready')
                return json({ error: 'Mark the test ready before creating a link.' }, 400);
            const id = crypto.randomUUID();
            const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
            const table = preview ? 'preview_attempts' : 'attempts';
            await deleteExpiredPreviews(owner, now);
            await insertRow(table, { id, owner, assessment_id: test.id, token_hash: await hashToken(token), alias: preview ? 'Preview' : body.alias.trim(), snapshot: JSON.stringify(test), status: 'not-started', created_at: now, answers: '{}', demo: 0, revision: 1, expires_at: now + (preview ? 3600000 : 7 * 86400000), revoked: 0 });
            return json({ id, path: `/take/${token}` });
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
            const clean = { ratings: review.outcome === 'not-scorable' ? {} : Object.fromEntries(criteria.filter(r => typeof review.ratings?.[r.key] === 'number').map(r => [r.key, review.ratings[r.key]])), evidence: Object.fromEntries(criteria.filter(r => typeof review.evidence?.[r.key] === 'string').map(r => [r.key, review.evidence![r.key].trim()])), notes: review.notes.trim(), outcome: review.outcome, reviewedAt: now, reviewer: user.email, history: previous ? [...(oldHistory || []), previousEntry] : [] };
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
