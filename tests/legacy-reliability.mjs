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
    const legacy = structuredClone(assessment);
    delete legacy.config;
    legacy.modules = [assessment.modules[3], assessment.modules[0]];
    legacy.title = 'BROWSER SYNTHETIC Legacy navigation review ' + Date.now();
    // Reuse this run's exact assessment ID and preserve cleanup ownership.
    const current = await request(admin, '/api/admin');
    const original = current.assessments.find(t => t.id === assessmentId);
    legacy.id = assessmentId; legacy.revision = original.revision;
    await request(admin, '/api/admin', { action: 'save', assessment: legacy });
    await run('legacy slow advance preserves every accepted writing edit', async () => {
        const { token, url } = await assignment();
        let state = await request(guest, '/api/candidate?token=' + token);
        state = await command(token, state, 'start');
        await command(token, state, 'save', { text: 'Initial customer reply.' });
        const intercepted = barrier(), release = barrier();
        const page = await guest.newPage(); page.on('pageerror', e => errors.push(e.message));
        await page.setViewportSize({ width: 390, height: 844 });
        let advances = 0;
        try {
            await page.route('**/api/candidate', async route => {
                if (route.request().postDataJSON()?.action === 'advance') {
                    advances++;
                    const response = await route.fetch();
                    intercepted.resolve(); await release.promise;
                    await route.fulfill({ response });
                } else await route.continue();
            });
            await page.goto(url);
            const reply = page.getByRole('textbox', { name: 'Your reply to the customer' });
            await reply.waitFor();
            await page.getByRole('button', { name: 'Save & continue', exact: true }).click();
            await waitForSignal(intercepted.promise);
            await page.getByRole('button', { name: 'Save & continue', exact: true }).evaluate(e => { e.click(); e.click(); });
            assert.equal(advances, 1);
            await reply.focus(); await page.keyboard.press('End'); await page.keyboard.type(' Extra detail.');
            const acceptedText = await reply.inputValue();
            await page.keyboard.press('Tab');
            assert.equal(await reply.evaluate(e => document.activeElement === e), false);
            const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
            assert.deepEqual(audit.violations.map(v => v.id), []);
            release.resolve();
            await page.getByRole('heading', { name: assessment.modules[0].title, exact: true }).waitFor();
            const advanced = await request(guest, '/api/candidate?token=' + token);
            assert.equal(advanced.deadline, state.deadline);
            const { data, error } = await db.from('attempts').select('answers').eq('id', attempts.at(-1)).single();
            if (error) throw error;
            const stored = typeof data.answers === 'string' ? JSON.parse(data.answers) : data.answers;
            assert.equal(stored[legacy.modules[0].id].text, acceptedText, 'No accepted writing may disappear when advancing');
        } finally { release.resolve(); await page.close(); }
    });
    await run('legacy failed advance restores writing and final submission locks choices', async () => {
        const { token, url } = await assignment();
        let state = await request(guest, '/api/candidate?token=' + token);
        state = await command(token, state, 'start');
        const intercepted = barrier(), release = barrier();
        const page = await guest.newPage(); page.on('pageerror', e => errors.push(e.message));
        let advances = 0;
        try {
            await page.route('**/api/candidate', async route => {
                if (route.request().postDataJSON()?.action === 'advance') {
                    advances++; intercepted.resolve(); await release.promise;
                    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary test failure.' }) });
                } else await route.continue();
            });
            await page.goto(url);
            const reply = page.getByRole('textbox', { name: 'Your reply to the customer' });
            await page.getByRole('button', { name: 'Save & continue', exact: true }).click();
            await waitForSignal(intercepted.promise);
            assert.equal(await reply.evaluate(e => e.readOnly), true);
            await page.getByRole('button', { name: 'Save & continue', exact: true }).evaluate(e => { e.click(); e.click(); });
            assert.equal(advances, 1);
            release.resolve();
            await page.getByRole('alert').filter({ hasText: 'Temporary test failure.' }).waitFor();
            await reply.focus(); await page.keyboard.type('Recovered reply.');
            await Promise.all([
                page.waitForResponse(r => r.url().endsWith('/api/candidate') && r.request().postDataJSON()?.action === 'save' && r.ok()),
                page.getByRole('button', { name: 'Retry saving', exact: true }).click()
            ]);
            const recovered = await request(guest, '/api/candidate?token=' + token);
            assert.equal(recovered.answer.text, 'Recovered reply.');
            assert.equal(recovered.deadline, state.deadline);
            assert.equal(recovered.sectionDeadline, state.sectionDeadline);
            await page.unroute('**/api/candidate');
            await page.getByRole('button', { name: 'Save & continue', exact: true }).click();
            const radios = page.getByRole('radiogroup').first().getByRole('radio');
            await radios.first().focus(); await page.keyboard.press('Space');
            await page.keyboard.press('ArrowDown');
            await page.waitForFunction(() => document.activeElement === document.querySelector('[role=radiogroup]')?.querySelectorAll('[role=radio]')[1]);
            await page.keyboard.press('Space');
            assert.equal(await radios.nth(1).isChecked(), true);
            const submitting = barrier(), finish = barrier();
            try {
                advances = 0;
                await page.route('**/api/candidate', async route => {
                    if (route.request().postDataJSON()?.action === 'advance') {
                        advances++; const response = await route.fetch();
                        submitting.resolve(); await finish.promise; await route.fulfill({ response });
                    } else await route.continue();
                });
                await page.getByRole('button', { name: 'Submit assessment', exact: true }).click();
                await page.getByRole('alertdialog').getByRole('button', { name: 'Submit assessment', exact: true }).click();
                await waitForSignal(submitting.promise);
                assert.equal(await radios.first().isDisabled(), true);
                await page.getByRole('button', { name: 'Submit assessment', exact: true }).evaluate(e => { e.click(); e.click(); });
                assert.equal(advances, 1);
                finish.resolve();
                await page.getByRole('heading', { name: /You’re all done/ }).waitFor();
                const done = await request(guest, '/api/candidate?token=' + token);
                assert.equal(done.status, 'completed');
            } finally { finish.resolve(); }
        } finally { release.resolve(); await page.close(); }
    });
    await run('legacy delayed autosave keeps newer writing and never rewinds visible timers', async () => {
        const { token, url } = await assignment();
        let state = await request(guest, '/api/candidate?token=' + token);
        state = await command(token, state, 'start');
        const intercepted = barrier(), release = barrier();
        const page = await guest.newPage(); page.on('pageerror', e => errors.push(e.message));
        let first = true;
        const clocks = () => page.locator('.section-timer strong, .overall-clock strong').allTextContents().then(values => values.map(v => { const [m,s] = v.split(':').map(Number); return m*60+s; }));
        try {
            await page.route('**/api/candidate', async route => {
                if (route.request().postDataJSON()?.action === 'save' && first) {
                    first = false; const response = await route.fetch();
                    intercepted.resolve(); await release.promise; await route.fulfill({ response });
                } else await route.continue();
            });
            await page.goto(url);
            const reply = page.getByRole('textbox', { name: 'Your reply to the customer' });
            await reply.fill('Initial reply.');
            await waitForSignal(intercepted.promise);
            await reply.fill('Newer reply while autosave waits.');
            await page.waitForTimeout(2500);
            const before = await clocks();
            const acknowledged = page.waitForResponse(r => r.url().endsWith('/api/candidate') && r.request().postDataJSON()?.action === 'save' && r.ok());
            release.resolve(); await acknowledged; await page.waitForTimeout(350);
            const after = await clocks();
            for (let i=0; i<before.length; i++) assert.ok(after[i] <= before[i], `Countdown gained time: ${before[i]} -> ${after[i]}`);
            assert.equal(await reply.inputValue(), 'Newer reply while autosave waits.');
            await page.waitForFunction(() => document.querySelector('.save-status')?.textContent === 'Saved');
            // Wait for the newer snapshot to persist, not just the older acknowledgement.
            let persisted;
            for (let i=0; i<30; i++) {
                persisted = await request(guest, '/api/candidate?token=' + token);
                if (persisted.answer.text === 'Newer reply while autosave waits.') break;
                await page.waitForTimeout(100);
            }
            assert.equal(persisted.answer.text, 'Newer reply while autosave waits.');
            assert.equal(persisted.deadline, state.deadline);
            assert.equal(persisted.sectionDeadline, state.sectionDeadline);
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
