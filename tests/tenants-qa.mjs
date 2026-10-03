// Local Supabase and mail only. Never send test signups to a hosted project.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';

const base = process.env.ASSESS_QA_BASE || 'http://127.0.0.1:5173';
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
assert.match(env.NEXT_PUBLIC_SUPABASE_URL, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const client = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const contexts = [], users = [];
const stamp = Date.now(), password = 'Local-QA-Only-57!Password';
let checks = 0;
function pass(name) { console.log(`PASS ${name}`); checks++; }
async function context() { const c = await browser.newContext({ baseURL: base }); contexts.push(c); return c; }
async function post(c, path, data, status = 200) {
    const r = await c.request.post(path, { data });
    assert.equal(r.status(), status, `${path}: ${await r.text()}`);
    return r.json();
}
async function workspace(c) {
    const r = await c.request.get('/api/admin'); assert.equal(r.status(), 200);
    return r.json();
}
async function register(c, email, viaBrowser = false) {
    if (viaBrowser) {
        const page = await c.newPage(); await page.goto('/signup');
        await page.getByLabel('Business name', { exact: true }).fill('QA Business');
        await page.getByLabel('Your name', { exact: true }).fill('QA owner');
        await page.getByLabel('Email address', { exact: true }).fill(email);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Create business account', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'Check your email' }).waitFor();
    } else {
        const result = await post(c, '/auth/signup', { businessName: 'QA Business', contactName: 'QA owner', email, password });
        assert.equal(result.ready, false);
    }
    const { data: list } = await service.auth.admin.listUsers();
    const user = list.users.find(u => u.email === email); assert.ok(user); users.push(user.id);
    assert.equal(user.email_confirmed_at, undefined);
    assert.equal((await service.from('workspace_members').select('id').eq('id', user.id)).data.length, 0);
    assert.equal((await service.from('tenants').select('id').eq('owner_id', user.id)).data.length, 0);
    assert.equal((await c.request.get('/api/admin')).status(), 401);
    return user;
}
async function confirm(c, email) {
    let message;
    for (let i = 0; i < 20 && !message; i++) {
        const inbox = await (await fetch('http://127.0.0.1:54324/api/v1/messages')).json();
        message = inbox.messages.find(m => m.To.some(to => to.Address === email));
        if (!message) await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(message, 'Local signup confirmation email must arrive');
    const full = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json();
    const link = full.HTML.match(/href="([^"]+\/auth\/v1\/verify[^\"]+)"/)[1].replaceAll('&amp;', '&');
    assert.match(link, /^http:\/\/(127\.0\.0\.1|localhost):54321\//);
    const r = await c.request.get(link); assert.equal(r.status(), 200);
    await workspace(c);
}
try {
    const a = await context(), b = await context(), unsigned = await context();
    const page = await unsigned.newPage();
    await page.goto('/signup');
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        assert.ok(await page.getByRole('button', { name: 'Create business account', exact: true }).isVisible());
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations, []);
    }
    assert.deepEqual(errors, []); pass('Signup renders and is accessible on desktop and mobile');
    await post(unsigned, '/auth/signup', { email: 'bad', password: 'short' }, 400);
    await post(unsigned, '/auth/signup', { businessName: 'QA', contactName: 'QA', email: 'bad@qa.invalid', password, role: 'global_admin' }, 400);
    assert.equal((await unsigned.request.post('/auth/signup', { headers: { Origin: 'https://foreign.invalid' }, data: {} })).status(), 403);
    pass('Signup rejects invalid input, submitted roles and cross-origin requests');

    const emailA = `tenant-a-${stamp}@qa.invalid`, emailB = `tenant-b-${stamp}@qa.invalid`;
    const userA = await register(a, emailA, true), userB = await register(b, emailB);
    pass('Unverified signups have no tenant or workspace access');
    await confirm(a, emailA); await confirm(b, emailB);
    const tenantA = (await service.from('tenants').select('*').eq('owner_id', userA.id)).data[0];
    const tenantB = (await service.from('tenants').select('*').eq('owner_id', userB.id)).data[0];
    assert.notEqual(tenantA.id, tenantB.id); assert.notEqual(tenantA.slug, tenantB.slug);
    assert.equal((await workspace(a)).role, 'admin'); assert.equal((await workspace(b)).assessments.length, 0);
    pass('Verified businesses with the same name get separate, empty tenants');

    const dbA = client(), dbB = client();
    assert.equal((await dbA.auth.signInWithPassword({ email: emailA, password })).error, null);
    assert.equal((await dbB.auth.signInWithPassword({ email: emailB, password })).error, null);
    const retry = await Promise.all([dbA.rpc('create_business', { business_name: 'Retry', contact_name: 'QA' }), dbA.rpc('create_business', { business_name: 'Retry', contact_name: 'QA' })]);
    retry.forEach(r => { assert.equal(r.error, null); assert.equal(r.data, tenantA.id); });
    assert.equal((await service.from('tenants').select('id').eq('owner_id', userA.id)).data.length, 1);
    pass('Repeated or concurrent provisioning cannot create duplicate tenants');

    const initial = await workspace(a), testModule = initial.presets.find(m => m.kind === 'spelling');
    const assessment = { id: '', title: `QA SYNTHETIC tenant ${stamp}`, description: '', status: 'ready', modules: [testModule], revision: 1, updatedAt: Date.now() };
    const saved = await post(a, '/api/admin', { action: 'save', assessment });
    const library = await post(a, '/api/admin', { action: 'save-module', module: testModule });
    const candidate = await post(a, '/api/admin', { action: 'link', id: saved.id, alias: 'QA candidate' });
    const preview = await post(a, '/api/admin', { action: 'preview', id: saved.id });
    assert.equal((await workspace(b)).assessments.length, 0);
    assert.equal((await workspace(b)).library.length, 0);
    await post(b, '/api/admin', { action: 'save', assessment: { ...assessment, id: saved.id } }, 404);
    await post(b, '/api/admin', { action: 'link', id: saved.id, alias: 'QA' }, 404);
    await post(b, '/api/admin', { action: 'save-module', id: library.id, revision: 1, module: testModule }, 404);
    assert.equal((await b.request.get(preview.path)).status(), 200); // page exists; API enforces preview permissions
    assert.equal((await b.request.get(`/api/candidate?token=${preview.path.split('/').at(-1)}`)).status(), 404);
    assert.equal((await unsigned.request.get(`/api/candidate?token=${candidate.path.split('/').at(-1)}`)).status(), 200);
    pass('API isolation covers assessments, modules, previews and candidate links');

    for (const table of ['assessments', 'modules', 'attempts', 'preview_attempts']) {
        const own = await dbA.from(table).select('*').eq('tenant_id', tenantA.id); assert.equal(own.error, null); assert.equal(own.data.length, 1);
        const foreign = await dbB.from(table).select('*').eq('tenant_id', tenantA.id); assert.equal(foreign.error, null); assert.deepEqual(foreign.data, []);
        const changed = await dbB.from(table).update({ revision: 99 }).eq('tenant_id', tenantA.id).select('id'); assert.equal(changed.error, null); assert.deepEqual(changed.data, []);
        const removed = await dbB.from(table).delete().eq('tenant_id', tenantA.id).select('id'); assert.equal(removed.error, null); assert.deepEqual(removed.data, []);
        assert.ok((await client().from(table).select('*')).error);
    }
    const wrongInsert = await dbB.from('modules').insert({ id: crypto.randomUUID(), owner: userA.id, content: testModule, updated_at: Date.now(), revision: 1 });
    assert.ok(wrongInsert.error);
    for (const table of ['attempts', 'preview_attempts']) {
        for (const patch of [{ snapshot: {} }, { answers: {} }, { result: {} }]) {
            assert.ok((await dbA.from(table).update(patch).eq('tenant_id', tenantA.id)).error);
        }
    }
    const move = await dbA.from('assessments').update({ owner: userB.id, tenant_id: tenantB.id }).eq('id', saved.id);
    assert.ok(move.error);
    const crossAttempt = await service.from('attempts').insert({ id: crypto.randomUUID(), owner: userB.id, assessment_id: saved.id, token_hash: 'f'.repeat(64), alias: 'QA', snapshot: assessment, status: 'not-started', created_at: Date.now(), expires_at: Date.now() + 1000 });
    assert.ok(crossAttempt.error); assert.equal(crossAttempt.error.code, '23503');
    pass('Database blocks cross-tenant reads, writes, moves and assessment references');

    assert.ok((await dbB.from('global_admins').insert({ user_id: userB.id })).error);
    assert.ok((await dbB.from('workspace_members').update({ role: 'admin', workspace_owner: userA.id }).eq('id', userB.id)).error);
    await dbB.auth.updateUser({ data: { role: 'global_admin', tenant_id: tenantA.id, workspace_owner: userA.id } });
    await b.addCookies([{ name: 'assess-tenant', value: tenantA.id, url: base }]);
    assert.equal((await workspace(b)).assessments.length, 0);
    await post(b, '/api/tenants', { tenantId: tenantA.id }, 403);
    await post(b, '/api/business', { businessName: 'QA', contactName: 'QA', tenantId: tenantA.id }, 400);
    pass('Metadata, cookies and direct requests cannot grant tenant or global permissions');

    assert.equal((await service.from('workspace_members').update({ role: 'viewer', workspace_owner: userA.id, tenant_id: tenantA.id }).eq('id', userB.id)).error?.code, 'P0001');
    // A team's non-owner membership is exercised by accounts-qa; global grants
    // below are trusted local fixtures, never created through signup.
    assert.equal((await service.from('global_admins').insert({ user_id: userA.id })).error, null);
    await post(a, '/api/tenants', { tenantId: tenantB.id });
    assert.equal((await a.request.post('/api/admin', { headers: { 'X-Tenant-Id': tenantA.id }, data: { action: 'save', assessment } })).status(), 409);
    assert.equal((await a.request.post('/api/accounts', { headers: { 'X-Tenant-Id': tenantA.id }, data: { action: 'add', name: 'QA stale', email: 'stale@qa.invalid', role: 'editor' } })).status(), 409);
    assert.equal((await workspace(a)).assessments.length, 0);
    assert.equal((await service.from('tenant_admin_audit').select('id').eq('user_id', userA.id).eq('tenant_id', tenantB.id)).data.length, 1);
    const globalPage = await a.newPage(); await globalPage.goto('/');
    await globalPage.getByLabel('Global admin · Business').waitFor();
    globalPage.on('dialog', dialog => dialog.accept());
    await globalPage.getByLabel('Global admin · Business').selectOption(tenantA.id);
    await globalPage.getByText(assessment.title, { exact: true }).waitFor();
    await service.from('global_admins').delete().eq('user_id', userA.id);
    await post(a, '/api/tenants', { tenantId: tenantB.id }, 403);
    pass('Global admin switches one business at a time, logs access and loses access immediately when revoked');
    console.log(`${checks} tenant checks passed`);
} finally {
    for (const c of contexts) await c.close(); await browser.close();
    for (const id of users) {
        for (const table of ['attempts', 'preview_attempts', 'assessments', 'modules']) await service.from(table).delete().eq('owner', id);
        await service.from('tenant_admin_audit').delete().eq('user_id', id);
        await service.from('global_admins').delete().eq('user_id', id);
        await service.from('workspace_members').delete().eq('id', id);
        await service.from('tenants').delete().eq('owner_id', id);
        await service.auth.admin.deleteUser(id);
    }
}
