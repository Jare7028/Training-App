import { NextResponse } from 'next/server';
import { firstRow, updateRows, RecordRow } from '@/db/store';
import { Answer, Assessment, scoreAttempt, workDuration, typingSeconds, canFinishTypingEarly } from '@/lib/assessment';

type Command = { action: string; revision: number; answer?: Answer; index?: number };
export async function flexibleCommand(row: RecordRow, body: Command, view: (row: RecordRow) => unknown) {
    const table = row.preview ? 'preview_attempts' : 'attempts';
    const assessment: Assessment = JSON.parse(String(row.snapshot));
    const now = Date.now();
    const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
    const answers: Record<string, Answer> = JSON.parse(String(row.answers));
    const index = Number(row.current_index), section = assessment.modules[index];
    const existing = answers[section.id] || {};
    const patch: RecordRow = {};
    if (body.action === 'start') {
        if (row.status !== 'not-started') return fail('This attempt has already started.');
        Object.assign(patch, { status: 'in-progress', started_at: now, deadline: now + workDuration(assessment) * 1000, section_started_at: now });
    } else {
        if (row.status !== 'in-progress') return fail('Start the assessment before answering.');
        if (!['save','navigate','submit','typing-start','typing-finish','typing-interrupted'].includes(body.action)) return fail('Invalid action.');
        if (body.action === 'typing-start') {
            if (section.kind !== 'typing') return fail('This section is not a measured typing task.');
            if (existing.typing) return fail('The typing sample cannot be restarted.');
            const window = typingSeconds(section) * 1000;
            if (Number(row.deadline) - now < window) return fail(`Less than ${window/1000} seconds remain. Continue with your other answers or submit the saved work.`);
            answers[section.id] = { text: '', typing: { startedAt: now, deadline: now + window, complete: false } };
        } else {
            const incoming = body.answer;
            if (section.kind === 'typing') {
                if (existing.typing?.complete && incoming?.text !== existing.text) return fail('The measured typing response is locked.');
                if (existing.typing && !existing.typing.complete) {
                    if (incoming && (typeof incoming.text !== 'string' || incoming.text.length > 5000)) return fail('Invalid typed response.');
                    if (incoming && now <= existing.typing.deadline + 2500) existing.text = incoming.text;
                    if (body.action === 'typing-interrupted') existing.typing.interrupted = true;
                    if (body.action === 'typing-finish') {
                        const exact = (existing.text || '').normalize('NFC') === (section.passage || '').normalize('NFC');
                        const seconds = typingSeconds(section);
                        if (now < existing.typing.deadline && (!exact || !canFinishTypingEarly(section))) return fail(`Type for the full ${seconds} seconds${canFinishTypingEarly(section) ? ', or finish the complete passage accurately' : ''}.`);
                        existing.typing.complete = true;
                        existing.typing.ceiling = exact && now < existing.typing.deadline;
                        existing.typing.seconds = Math.min(seconds, Math.max(.001, (now - existing.typing.startedAt) / 1000));
                    }
                    answers[section.id] = existing;
                }
                if (body.action === 'navigate' && existing.typing && !existing.typing.complete) return fail('Finish the measured typing task before changing sections.');
            } else if (incoming) {
                if (section.questions) {
                    const choices: Record<string, number> = {};
                    for (const q of section.questions) {
                        const choice = incoming.choices?.[q.id];
                        if (choice !== undefined) { if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return fail('Invalid answer choice.'); choices[q.id] = choice; }
                    }
                    answers[section.id] = { choices };
                } else {
                    if (typeof incoming.text !== 'string' || incoming.text.length > 5000) return fail('Keep the reply under 5,000 characters.');
                    answers[section.id] = { text: incoming.text };
                }
            }
        }
        patch.answers = JSON.stringify(answers);
        if (body.action === 'navigate') {
            if (!Number.isInteger(body.index) || body.index! < 0 || body.index! >= assessment.modules.length) return fail('Invalid section.');
            patch.current_index = body.index;
        }
        if (body.action === 'submit') {
            patch.status = 'completed';
            patch.result = JSON.stringify(scoreAttempt(assessment.modules, answers, Math.min(now, Number(row.deadline)), now >= Number(row.deadline)));
        }
    }
    patch.revision = Number(row.revision) + 1;
    const changed = await updateRows(table, patch, { id: row.id, revision: row.revision, status: row.status });
    if (!changed) return NextResponse.json({ error: 'Another tab changed this attempt. Reload saved state.', conflict: true }, { status: 409 });
    const updated = await firstRow(table, { id: row.id });
    return NextResponse.json(view({ ...updated!, preview: row.preview }), { headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
