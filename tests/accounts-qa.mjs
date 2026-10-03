// Synthetic local accounts only. No emails are sent; setup links stay in memory.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';

const base = process.env.ASSESS_QA_BASE || 'http://127.0.0.1:5173';
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const values = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
assert.match(values.NEXT_PUBLIC_SUPABASE_URL, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const service = createClient(values.NEXT_PUBLIC_SUPABASE_URL, values.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
const contexts = [];
const added = [];
const createdTests = [];
const stamp = Date.now();
const password = 'Local-QA-Only-57!Password';
let checks = 0;
function pass(name) { checks++; console.log(`PASS ${name}`); }
async function context() { const result = await browser.newContext({ baseURL: base }); contexts.push(result); return result; }
async function login(context, email) { const response = await context.request.post('/auth/login', { data: { email, password } }); assert.equal(response.status(), 200); }
async function post(context, data, expected = 200, path = '/api/accounts') {
    const response = await context.request.post(path, { data });
    assert.equal(response.status(), expected, `Unexpected status for ${data.action}`);
    return response.json();
}
async function accounts(context) { const response = await context.request.get('/api/accounts'); assert.equal(response.status(), 200); return (await response.json()).accounts; }
async function audit(page, name) { const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); assert.deepEqual(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), []); pass(name); }
try {
    const owner = await context(), second = await context(), unsigned = await context();
    assert.equal((await unsigned.request.get('/api/accounts')).status(), 401);
    assert.equal((await unsigned.request.post('/api/accounts', { data: { action: 'add' } })).status(), 401);
    pass('Unsigned requests cannot list or create accounts');
    assert.equal((await unsigned.request.post('/auth/password', { data: { password } })).status(), 401);
    assert.equal((await unsigned.request.post('/auth/password', { data: { password: 'short' } })).status(), 400);
    assert.equal((await unsigned.request.post('/auth/password', { headers: { Origin: 'https://foreign.invalid' }, data: { password } })).status(), 403);
    pass('Password updates require a valid session, same origin and valid length');
    await login(owner, 'recruiter@qa.invalid'); await login(second, 'second@qa.invalid');
    const original = await accounts(owner);
    const ownerAccount = original.find(account => account.owner);
    assert.ok(ownerAccount); assert.equal(ownerAccount.role, 'admin');
    pass('Legacy allowlist creates a protected workspace owner');
    await post(owner, { action: 'update', id: ownerAccount.id, role: 'viewer', status: 'suspended', revision: ownerAccount.revision }, 403);
    pass('Owner cannot demote or suspend themselves');
    const foreign = await owner.request.post('/api/accounts', { headers: { Origin: 'https://foreign.invalid' }, data: { action: 'add', name: 'QA', email: `foreign-${stamp}@qa.invalid`, role: 'viewer' } });
    assert.equal(foreign.status(), 403); pass('Cross-origin account changes are rejected');
    for (const data of [null, [], { action: 'add', name: 'QA', email: 'invalid', role: 'viewer' }, { action: 'add', name: 'QA', email: `bad-${stamp}@qa.invalid`, role: 'owner' }]) {
        assert.equal((await owner.request.post('/api/accounts', { data })).status(), 400);
    }
    pass('Malformed accounts and unknown roles are rejected');
    const page = await owner.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('button', { name: 'Accounts & permissions', exact: true }).click();
    await page.getByRole('heading', { name: 'Accounts & permissions', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Add account', exact: true }).click();
    await page.getByLabel('Full name', { exact: true }).fill('QA account editor');
    const editorEmail = `accounts-editor-${stamp}@qa.invalid`;
    await page.getByLabel('Email address', { exact: true }).fill(editorEmail);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByLabel('Account setup link', { exact: true }).waitFor();
    const setup = await page.getByLabel('Account setup link', { exact: true }).inputValue();
    const editorAccount = (await accounts(owner)).find(account => account.email === editorEmail);
    assert.ok(editorAccount); added.push(editorAccount.id);
    pass('Admin creates an Editor account through the account screen');
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: 'Accounts & permissions', exact: true }).waitFor();
    await audit(page, 'Account management desktop accessibility');
    mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/accounts-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await audit(page, 'Account management mobile accessibility');
    await page.screenshot({ path: 'test-results/accounts-mobile.png', fullPage: true });
    pass('Account management fits desktop and mobile');
    const editor = await context(), editorPage = await editor.newPage();
    await editorPage.goto(setup);
    assert.equal(new URL(editorPage.url()).origin, base);
    await editorPage.getByLabel('New password', { exact: true }).fill(password);
    await editorPage.getByLabel('Confirm password', { exact: true }).fill(password);
    await editorPage.getByRole('button', { name: 'Save password', exact: true }).click();
    try { await editorPage.getByRole('heading', { name: 'Assessments', exact: true }).waitFor({ timeout: 10000 }); }
    catch (error) { await editorPage.screenshot({ path: 'test-results/accounts-setup-failure.png', fullPage: true }); console.log('Setup failure page:', await editorPage.locator('main').innerText()); console.log('Workspace API status:', (await editor.request.get('/api/admin')).status()); throw error; }
    assert.equal((await (await editor.request.get('/api/admin')).json()).role, 'editor');
    pass('New account accepts setup link, sets password and opens workspace');
    const replay = await unsigned.request.get(new URL(setup).pathname + new URL(setup).search, { maxRedirects: 0 });
    assert.match(replay.headers().location, /\/login\?error=link$/); pass('Account setup link cannot be reused');
    assert.equal((await editor.request.get('/api/accounts')).status(), 403);
    await post(editor, { action: 'add', email: `forbidden-${stamp}@qa.invalid`, name: 'QA', role: 'admin' }, 403);
    assert.equal(await editorPage.getByRole('button', { name: 'Accounts & permissions', exact: true }).count(), 0);
    pass('Editor cannot open account management or add Admins');
    const assessment = { id: '', title: `QA SYNTHETIC accounts ${stamp}`, description: 'Local account permissions check', status: 'ready', modules: [{ id: 'spell', kind: 'spelling', title: 'Synthetic spelling', seconds: 15, instructions: 'Choose A.', questions: [{ id: 'q', prompt: 'Choose A', options: ['A', 'B'], correct: 0, explanation: 'A is correct.' }] }], updatedAt: 0, revision: 1 };
    const saved = await post(editor, { action: 'save', assessment }, 200, '/api/admin'); createdTests.push(saved.id);
    const ownerTests = (await (await owner.request.get('/api/admin')).json()).assessments;
    assert.ok(ownerTests.some(test => test.id === saved.id));
    const secondTests = (await (await second.request.get('/api/admin')).json()).assessments;
    assert.ok(!secondTests.some(test => test.id === saved.id));
    pass('Editor shares owner assessments while separate workspaces stay isolated');
    const preview = await post(editor, { action: 'preview', id: saved.id }, 200, '/api/admin');
    const previewPath = `/api/candidate?token=${preview.path.split('/').pop()}`;
    assert.equal((await owner.request.get(previewPath)).status(), 200);
    assert.equal((await second.request.get(previewPath)).status(), 404);
    assert.equal((await unsigned.request.get(previewPath)).status(), 404);
    pass('Preview attempts are shared only with authorised workspace editors');
    await post(second, { action: 'update', id: editorAccount.id, role: 'admin', status: 'active', revision: 1 }, 404);
    await post(second, { action: 'setup-link', id: editorAccount.id }, 404);
    pass('Admin cannot change accounts belonging to another workspace');
    await post(owner, { action: 'setup-link', id: editorAccount.id }, 400);
    pass('Admins cannot generate sign-in tokens for configured accounts');
    const anonymous = createClient(values.NEXT_PUBLIC_SUPABASE_URL, values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    await anonymous.auth.signInWithPassword({ email: editorEmail, password });
    assert.equal((await anonymous.auth.updateUser({ data: { role: 'admin', workspace_owner: editorAccount.id } })).error, null);
    assert.equal((await (await editor.request.get('/api/admin')).json()).role, 'editor');
    const ownMembership = await anonymous.from('workspace_members').select('*');
    assert.equal(ownMembership.error, null);
    assert.deepEqual(ownMembership.data.map(row => row.id), [editorAccount.id]);
    const unsignedClient = createClient(values.NEXT_PUBLIC_SUPABASE_URL, values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    assert.ok((await unsignedClient.from('workspace_members').select('*')).error);
    for (const client of [anonymous, unsignedClient]) {
        assert.ok((await client.from('workspace_members').update({ role: 'admin' }).eq('id', editorAccount.id)).error);
    }
    pass('User metadata and direct database requests cannot grant roles');
    await post(owner, { action: 'update', id: editorAccount.id, role: 'viewer', status: 'active', revision: 1 });
    await post(owner, { action: 'update', id: editorAccount.id, role: 'admin', status: 'active', revision: 1 }, 409);
    assert.equal((await (await editor.request.get('/api/admin')).json()).role, 'viewer');
    assert.equal((await editor.request.get(previewPath)).status(), 404);
    for (const action of ['save', 'save-module', 'link', 'preview', 'review', 'revoke']) await post(editor, { action }, 403, '/api/admin');
    pass('Role changes affect existing sessions and Viewer cannot perform any mutation');
    await editorPage.reload();
    await editorPage.getByText('Viewer access:', { exact: false }).waitFor();
    assert.equal(await editorPage.getByRole('button', { name: 'Create assessment', exact: true }).count(), 0);
    await editorPage.getByRole('button', { name: 'View assessment', exact: true }).first().click();
    await editorPage.getByRole('dialog').waitFor(); await editorPage.keyboard.press('Escape');
    assert.equal(await editorPage.getByRole('button', { name: 'Accounts & permissions', exact: true }).count(), 0);
    pass('Viewer sees saved content and no editing or account-management controls');
    const candidate = await post(owner, { action: 'link', id: saved.id, alias: `QA SYNTHETIC accounts ${stamp}` }, 200, '/api/admin');
    assert.equal((await unsigned.request.get(`/api/candidate?token=${candidate.path.split('/').pop()}`)).status(), 200);
    pass('Public candidate links continue to work without an account');
    await post(owner, { action: 'update', id: editorAccount.id, role: 'viewer', status: 'suspended', revision: 2 });
    assert.equal((await editor.request.get('/api/admin')).status(), 401);
    assert.equal((await editor.request.get('/api/accounts')).status(), 401);
    await post(editor, { action: 'save' }, 401, '/api/admin');
    pass('Suspension blocks reads and writes using an existing session');
    await post(owner, { action: 'update', id: editorAccount.id, role: 'admin', status: 'active', revision: 3 });
    assert.equal((await editor.request.get('/api/accounts')).status(), 200);
    await post(editor, { action: 'update', id: editorAccount.id, role: 'viewer', status: 'active', revision: 4 }, 403);
    pass('Access can be restored and Admins cannot change their own access');
    const pendingEmail = `accounts-pending-${stamp}@qa.invalid`;
    await post(owner, { action: 'add', email: pendingEmail, name: 'QA pending', role: 'viewer' });
    const pending = (await accounts(owner)).find(account => account.email === pendingEmail); added.push(pending.id);
    const regenerated = await post(owner, { action: 'setup-link', id: pending.id });
    assert.ok(regenerated.setupPath); pass('Unconfirmed accounts can receive a replacement setup link');
    const accepted = await unsigned.request.get(regenerated.setupPath, { maxRedirects: 0 });
    assert.equal(accepted.status(), 307); assert.equal(accepted.headers().location, base + '/account/password');
    pass('Replacement account setup link authenticates on the original hostname');
    await post(owner, { action: 'add', email: pendingEmail, name: 'QA duplicate', role: 'admin' }, 409);
    await post(owner, { action: 'add', email: 'second@qa.invalid', name: 'QA existing owner', role: 'viewer' }, 409);
    pass('Duplicate accounts and existing workspace owners are protected');
    const existingEmail = `accounts-existing-${stamp}@qa.invalid`;
    const existing = await service.auth.admin.createUser({ email: existingEmail, password, email_confirm: true });
    assert.equal(existing.error, null); added.push(existing.data.user.id);
    const joined = await post(owner, { action: 'add', email: existingEmail, name: 'QA existing account', role: 'viewer' });
    assert.equal(joined.setupPath, null);
    const existingContext = await context(); await login(existingContext, existingEmail);
    assert.equal((await (await existingContext.request.get('/api/admin')).json()).role, 'viewer');
    pass('Existing accounts join using their current password without a setup token');
    assert.deepEqual(errors, []); pass('Account management has no browser runtime errors');
    console.log(`${checks} account and permission checks passed`);
} finally {
    for (const id of createdTests) for (const table of ['attempts', 'preview_attempts', 'assessments']) {
        const { error } = await service.from(table).delete().eq(table === 'assessments' ? 'id' : 'assessment_id', id); assert.equal(error, null);
    }
    for (const id of added) {
        assert.equal((await service.from('workspace_members').delete().eq('id', id)).error, null);
        assert.equal((await service.auth.admin.deleteUser(id)).error, null);
    }
    for (const context of contexts) await context.close();
    await browser.close();
}
