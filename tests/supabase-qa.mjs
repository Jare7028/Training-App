// Exercises the real local Supabase permissions and session boundary.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
const values = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const url = values.NEXT_PUBLIC_SUPABASE_URL;
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const create = () => createClient(url, values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = create(), authenticated = create();
const { error: loginError } = await authenticated.auth.signInWithPassword({ email: 'recruiter@qa.invalid', password: 'Local-QA-Only-57!Password' });
assert.equal(loginError, null);
let checks = 1;
for (const [role, client] of [['anonymous', anonymous], ['authenticated', authenticated]]) {
    for (const table of ['assessments', 'modules', 'attempts', 'preview_attempts']) {
        const { error, status } = await client.from(table).select('*');
        assert.ok(error, `${role} must not read ${table}`);
        assert.ok(status === 401 || status === 403);
        checks++; console.log(`${role} direct access to ${table} denied`);
    }
}
const { error: signupError } = await anonymous.auth.signUp({ email: `signup-${Date.now()}@qa.invalid`, password: 'Local-QA-Only-57!Password' });
assert.ok(signupError); assert.equal(signupError.code, 'signup_disabled'); checks++;
async function appLogin() {
    const response = await fetch('http://127.0.0.1:5173/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:5173' }, body: JSON.stringify({ email: 'recruiter@qa.invalid', password: 'Local-QA-Only-57!Password' }) });
    assert.equal(response.status, 200);
    return response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}
const cookie = await appLogin(); checks++;
const foreign = await fetch('http://127.0.0.1:5173/auth/signout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://foreign.example' }, redirect: 'manual' });
assert.equal(foreign.status, 403); checks++;
const signout = await fetch('http://127.0.0.1:5173/auth/signout', { method: 'POST', headers: { Cookie: cookie, Origin: 'http://127.0.0.1:5173' }, redirect: 'manual' });
assert.equal(signout.status, 303); checks++;
// A revoked session cannot regain workspace access with its old cookie.
const after = await fetch('http://127.0.0.1:5173/api/admin', { headers: { Cookie: cookie } });
assert.equal(after.status, 401); checks++;
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(f => f.isDirectory() ? files(path.join(dir, f.name)) : [path.join(dir, f.name)]); }
for (const file of files('.next/static').filter(f => f.endsWith('.js'))) {
    assert.ok(!readFileSync(file,'utf8').includes(values.SUPABASE_SERVICE_ROLE_KEY), 'Server credential must not enter a browser bundle');
}
checks++;
console.log(`${checks} Supabase security checks passed`);
