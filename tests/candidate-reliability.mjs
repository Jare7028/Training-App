// Fault-injection checks against real local Next.js/Supabase, never hosted data.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:5173';
mkdirSync('test-results/reliability', { recursive: true });
const config = readFileSync('.env.local', 'utf8');
assert.ok(config.startsWith('# Generated local QA configuration'));
const env = Object.fromEntries(config.split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
assert.match(env.NEXT_PUBLIC_SUPABASE_URL, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
const admin = await browser.newContext();
const guest = await browser.newContext();
const attempts = [];
let assessmentId;
const errors = [];
const failures = [];
const barrier = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function request(context, path, body) {
    const response = body ? await context.request.post(base + path, { data: body, headers: { Origin: base } }) : await context.request.get(base + path);
    const data = await response.json();
    assert.equal(response.status(), 200, JSON.stringify(data));
    return data;
}
async function waitForSignal(signal) {
    let timeout;
    try {
        await Promise.race([signal, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Expected request was not intercepted')), 10000); })]);
    } finally { clearTimeout(timeout); }
}
async function assignment() {
    const link = await request(admin, '/api/admin', { action: 'link', id: assessmentId, alias: 'BROWSER SYNTHETIC Network reliability' });
    attempts.push(link.id);
    return { token: link.path.split('/').at(-1), url: base + link.path };
}
async function command(token, session, action, answer = {}, index) {
    return request(guest, '/api/candidate', { token, revision: session.revision, action, answer, index });
}
async function run(name, test) {
    try { await test(); console.log('PASS:', name); }
    catch (error) { failures.push(name); console.error('FAIL:', name, error.message); }
}
try {
    await request(admin, '/auth/login', { email: 'recruiter@qa.invalid', password: 'Local-QA-Only-57!Password' });
    const assessment = JSON.parse(readFileSync('content/customer-service-core-v1.json', 'utf8'));
    assessment.title = `BROWSER SYNTHETIC Reliability ${Date.now()}`;
    assessment.config.code = 'QA-RELIABILITY';
    assessmentId = (await request(admin, '/api/admin', { action: 'save', assessment })).id;
    await run('failed start is visible and can be retried without starting the clock', async () => {
        const { token, url } = await assignment();
        const page = await guest.newPage(); page.on('pageerror', e => errors.push(e.message));
        await page.setViewportSize({ width: 390, height: 844 });
        try {
            let fail = true;
            await page.route('**/api/candidate', async route => {
                if (route.request().postDataJSON()?.action === 'start' && fail) {
                    fail = false;
                    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary test connection failure.' }) });
                } else await route.continue();
            });
            await page.goto(url);
            await page.getByRole('checkbox').check();
            await page.getByRole('button', { name: 'Start assessment', exact: true }).click();
            await page.getByRole('alert').filter({ hasText: 'Temporary test connection failure.' }).waitFor({ timeout: 3000 });
            const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
            assert.deepEqual(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), []);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: 'test-results/reliability/start-error-mobile.png', fullPage: true });
            const state = await request(guest, '/api/candidate?token=' + token);
            assert.equal(state.status, 'not-started'); assert.equal(state.deadline, null);
            await page.getByRole('button', { name: 'Start assessment', exact: true }).click();
            await page.locator('.candidate-question').first().waitFor();
            assert.equal(await page.locator('.save-error').count(), 0);
        } finally { await page.close(); }
    });
    await run('lost start response can reload the already-started attempt without resetting its deadline', async () => {
        const { token, url } = await assignment();
        const page = await guest.newPage(); page.on('pageerror', e => errors.push(e.message));
        try {
            await page.route('**/api/candidate', async route => {
                if (route.request().postDataJSON()?.action === 'start') {
                    await route.fetch(); // Server commits; only its response is lost.
                    await route.abort('failed');
                } else await route.continue();
            });
            await page.goto(url); await page.getByRole('checkbox').check();
            await page.getByRole('button', { name: 'Start assessment', exact: true }).click();
            await page.getByRole('alert').filter({ hasText: 'We couldn’t confirm the start' }).waitFor({ timeout: 3000 });
            const state = await request(guest, '/api/candidate?token=' + token);
            assert.equal(state.status, 'in-progress');
            await page.getByRole('button', { name: 'Reload saved state', exact: true }).click();
            await page.locator('.candidate-question').first().waitFor();
            const resumed = await request(guest, '/api/candidate?token=' + token);
            assert.equal(resumed.deadline, state.deadline);
        } finally { await page.close(); }
    });
    for (const editDuringWait of [true, false]) await run(editDuringWait
        ? 'typing reload preserves keystrokes entered while interruption confirmation is delayed'
        : 'delayed interruption acknowledgement cannot add time to either displayed countdown', async () => {
        const { token, url } = await assignment();
        let state = await request(guest, '/api/candidate?token=' + token);
        state = await command(token, state, 'start');
        state = await command(token, state, 'navigate', {}, 1);
        state = await command(token, state, 'typing-start');
        state = await command(token, state, 'save', { text: 'Case ' });
        const typingDeadline = state.answer.typing.deadline;
        const workDeadline = state.deadline;
        const intercepted = barrier(), release = barrier();
        const page = await guest.newPage(); page.on('pageerror', e => errors.push(e.message));
        try {
            await page.route('**/api/candidate', async route => {
                if (route.request().postDataJSON()?.action === 'typing-interrupted') {
                    const response = await route.fetch();
                    intercepted.resolve(); await release.promise;
                    await route.fulfill({ response });
                } else await route.continue();
            });
            await page.goto(url); await waitForSignal(intercepted.promise);
            const input = page.getByLabel('Your typed copy', { exact: true });
            const clockValue = label => page.getByRole('timer', { name: label, exact: true }).evaluate(e => e.textContent.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0));
            if (editDuringWait) {
                await input.press('End'); await input.pressSequentially('2048 is open.', { delay: 10 });
            } else {
                const initialSeconds = await clockValue('Typing time remaining');
                // Keep the real server response pending while three seconds of countdown elapse.
                await page.waitForFunction(limit => document.querySelector('[aria-label="Typing time remaining"]').textContent.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0) <= limit, initialSeconds - 3);
            }
            const edited = await input.inputValue(); assert.equal(edited, editDuringWait ? 'Case 2048 is open.' : 'Case ');
            const clocksBefore = await Promise.all(['Typing time remaining', 'Work time remaining'].map(clockValue));
            const saved = editDuringWait ? page.waitForResponse(r => r.url().endsWith('/api/candidate') && r.request().postDataJSON()?.action === 'save' && r.ok()) : Promise.resolve();
            // Attach immediately so a baseline failure can close the page without an unhandled rejection.
            saved.catch(() => {});
            release.resolve();
            await page.getByText('This sample was interrupted and will be flagged for technical review.', { exact: true }).waitFor();
            assert.equal(await input.inputValue(), edited);
            if (!editDuringWait) {
                // The display updates every 250ms; observe it after accepting the stale timestamp.
                await page.waitForTimeout(350);
                const clocksAfter = await Promise.all(['Typing time remaining', 'Work time remaining'].map(clockValue));
                for (const [index, seconds] of clocksAfter.entries()) assert.ok(seconds <= clocksBefore[index], `Countdown gained time: ${clocksBefore[index]} -> ${seconds}`);
            }
            await saved;
            const persisted = await request(guest, '/api/candidate?token=' + token);
            assert.equal(persisted.answer.text, edited);
            assert.equal(persisted.answer.typing.interrupted, true);
            assert.equal(persisted.answer.typing.deadline, typingDeadline);
            assert.equal(persisted.deadline, workDeadline);
        } finally { release.resolve(); await page.close(); }
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, [], 'Candidate reliability regressions');
} finally {
    await browser.close();
    // Delete only exact IDs created by this run, with a verified loopback database.
    if (attempts.length) {
        const { error } = await db.from('attempts').delete().in('id', attempts);
        if (error) throw error;
    }
    if (assessmentId) {
        const { error } = await db.from('assessments').delete().eq('id', assessmentId);
        if (error) throw error;
    }
}
