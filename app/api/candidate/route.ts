import { getAssessmentAdmin } from '@/app/admin-auth';
import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/request-origin';
import { firstRow, updateRows, hashToken, RecordRow } from '@/db/store';
import { Assessment, Answer, candidateModule, duration, scoreAttempt } from '@/lib/assessment';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
function table(row: RecordRow) { return row.preview ? 'preview_attempts' : 'attempts'; }
async function reload(row: RecordRow) { return { ...(await firstRow(table(row), { id: row.id }))!, preview: row.preview }; }
async function find(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const hash = await hashToken(token);
    let row = await firstRow('attempts', { token_hash: hash, demo: 0 });
    if (!row) {
        const preview = await firstRow('preview_attempts', { token_hash: hash });
        if (!preview) return null;
        const admin = await getAssessmentAdmin();
        if (!admin || admin.userId !== preview.owner) return null;
        row = { ...preview, preview: true };
    }
    if (row.revoked || Number(row.expires_at) <= Date.now()) return null;
    return row;
}
function view(row: RecordRow) { const t: Assessment = JSON.parse(String(row.snapshot)); const index = Number(row.current_index); const section = t.modules[index]; return { id: row.id, title: t.title, description: t.description, alias: row.alias, status: row.status, preview: !!row.preview, seconds: duration(t.modules), sections: t.modules.map(m => ({ title: m.title, kind: m.kind, seconds: m.seconds })), currentIndex: index, module: row.status === 'in-progress' && section ? candidateModule(section) : null, answer: row.status === 'in-progress' && section ? JSON.parse(String(row.answers))[section.id] || {} : {}, startedAt: row.started_at, deadline: row.deadline, sectionDeadline: row.section_started_at && section ? Math.min(Number(row.deadline), Number(row.section_started_at) + section.seconds * 1000) : null, serverNow: Date.now(), revision: row.revision }; }
async function expire(row: RecordRow) { if (row.status === 'in-progress' && Number(row.deadline) + 2500 <= Date.now()) {
    const t: Assessment = JSON.parse(String(row.snapshot));
    const result = scoreAttempt(t.modules, JSON.parse(String(row.answers)), Number(row.deadline), true);
    await updateRows(table(row), { status: 'completed', result: JSON.stringify(result), revision: Number(row.revision) + 1 }, { id: row.id, revision: row.revision, status: 'in-progress' });
    return await reload(row);
} return row; }
export async function GET(request: Request) { try {
    const row = await find(new URL(request.url).searchParams.get('token') || '');
    if (!row)
        return json({ error: 'This assessment link is invalid or unavailable.' }, 404);
    return json(view(await expire(row)));
}
catch (e) {
    console.error('Candidate load', e);
    return json({ error: 'The assessment is temporarily unavailable. Please retry.' }, 503);
} }
export async function POST(request: Request) {
    try {
        if (!sameOrigin(request))
            return json({ error: 'Invalid request origin.' }, 403);
        if (Number(request.headers.get('content-length') || 0) > 30000)
            return json({ error: 'Answer is too large.' }, 413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 30000)
            return json({ error: 'Answer is too large.' }, 413);
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
            token: string;
            action: string;
            revision: number;
            answer: Answer;
        };
        let row = await find(String(body.token || ''));
        if (!row)
            return json({ error: 'This assessment link is invalid or unavailable.' }, 404);
        if (row.status === 'in-progress' && Number(row.deadline) + 2500 < Date.now())
            row = await expire(row);
        const t: Assessment = JSON.parse(String(row.snapshot));
        const now = Date.now();
        if (row.status === 'completed')
            return json(view(row));
        if (row.revision !== body.revision)
            return json({ error: 'Your assessment has changed in another tab. Reload to continue.', conflict: true }, 409);
        if (body.action === 'start') {
            if (row.status !== 'not-started')
                return json(view(row));
            const r = await updateRows(table(row), { status: 'in-progress', started_at: now, deadline: now + duration(t.modules) * 1000, section_started_at: now, revision: Number(row.revision) + 1 }, { id: row.id, revision: row.revision, status: 'not-started' });
            if (!r)
                return json({ error: 'The assessment has changed. Reload to continue.', conflict: true }, 409);
            return json(view(await reload(row)));
        }
        if (row.status !== 'in-progress' || !['save', 'advance'].includes(body.action))
            return json({ error: 'Start the assessment before answering.' }, 400);
        const index = Number(row.current_index);
        const section = t.modules[index];
        if (!section)
            return json({ error: 'Invalid assessment state.' }, 400);
        const sectionDeadline = Math.min(Number(row.deadline), Number(row.section_started_at) + section.seconds * 1000);
        const answers: Record<string, Answer> = JSON.parse(String(row.answers));
        const a = body.answer;
        if (!a || typeof a !== 'object')
            return json({ error: 'Invalid answer.' }, 400);
        const clean: Answer = {};
        if (section.questions) {
            clean.choices = {};
            for (const q of section.questions) {
                const v = a.choices && typeof a.choices === 'object' && Object.hasOwn(a.choices, q.id) ? a.choices[q.id] : undefined;
                if (v !== undefined) {
                    if (!Number.isInteger(v) || v < 0 || v >= q.options.length)
                        return json({ error: 'Invalid answer choice.' }, 400);
                    clean.choices[q.id] = v;
                }
            }
        }
        else {
            if (typeof a.text !== 'string' || a.text.length > 5000)
                return json({ error: 'Keep your answer under 5,000 characters.' }, 400);
            clean.text = a.text;
        }
        // A small network grace window accepts a final buffered answer, never extends the clock.
        if (now <= sectionDeadline + 2500)
            answers[section.id] = clean;
        let next = index;
        let started = row.section_started_at;
        let status = row.status;
        let result = row.result;
        if (body.action === 'advance' || now >= sectionDeadline) {
            if (section.kind === 'typing' && now < sectionDeadline)
                return json({ error: 'Continue typing until the sample timer ends.' }, 400);
            next++;
            started = now;
            if (next >= t.modules.length || now >= Number(row.deadline)) {
                status = 'completed';
                result = JSON.stringify(scoreAttempt(t.modules, answers, Math.min(now, Number(row.deadline)), now >= Number(row.deadline)));
            }
        }
        const r = await updateRows(table(row), { answers: JSON.stringify(answers), current_index: next, section_started_at: started, status, result, revision: Number(row.revision) + 1 }, { id: row.id, revision: row.revision, status: 'in-progress' });
        if (!r)
            return json({ error: 'The assessment has changed in another tab. Reload to continue.', conflict: true }, 409);
        return json(view(await reload(row)));
    }
    catch (e) {
        console.error('Candidate mutation', e);
        return json({ error: 'Your answer could not be saved. Keep this page open and retry.' }, 503);
    }
}
