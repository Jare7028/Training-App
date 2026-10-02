// Local Supabase only. Fixtures contain test accounts, never sample candidates.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
const root = path.resolve(import.meta.dirname, '..');
const status = spawnSync(process.execPath, [path.join(root, 'scripts/supabase-cli.mjs'), 'status', '-o', 'json'], { cwd: root, encoding: 'utf8' });
if (status.status !== 0) throw new Error('Local Supabase is unavailable. Run npm run db:start first.');
const info = JSON.parse(status.stdout);
const url = info.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw new Error('Refusing a non-local database.');
const admin = createClient(url, info.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const emails = ['recruiter@qa.invalid', 'second@qa.invalid', 'guest@qa.invalid'];
const password = 'Local-QA-Only-57!Password';
async function users() {
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) throw new Error('Unable to load local QA users.');
    return data.users;
}
if (process.argv[2] === 'setup') {
    const existing = await users();
    for (const email of emails) if (!existing.some(u => u.email === email)) {
        const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) throw new Error('Unable to create local QA account.');
    }
    const envPath = path.join(root, '.env.local');
    let old = '';
    try { old = readFileSync(envPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (old && !old.startsWith('# Generated local QA configuration')) throw new Error('Preserving existing .env.local. Move it aside before setting up local QA.');
    writeFileSync(envPath, `# Generated local QA configuration; never deploy this file.\nNEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${info.ANON_KEY}\nSUPABASE_SERVICE_ROLE_KEY=${info.SERVICE_ROLE_KEY}\nASSESS_ADMIN_EMAILS=${emails.slice(0,2).join(',')}\n`, { mode: 0o600 });
    console.log('Three local QA accounts prepared. No candidates or assessments were seeded.');
} else if (process.argv[2] === 'clean') {
    const owners = (await users()).filter(u => emails.slice(0,2).includes(u.email)).map(u => u.id);
    for (const owner of owners) {
        const { data, error } = await admin.from('assessments').select('id,title').eq('owner', owner);
        if (error) throw new Error('Unable to inspect local QA records.');
        const ids = data.filter(r => /^(QA|WORKFLOW|BROWSER) SYNTHETIC\b/.test(r.title)).map(r => r.id);
        if (ids.length) for (const table of ['attempts', 'preview_attempts', 'assessments']) {
            const { error } = await admin.from(table).delete().eq('owner',owner).in(table === 'assessments' ? 'id' : 'assessment_id',ids);
            if (error) throw new Error('Unable to remove local QA records.');
        }
        const { data: modules, error: moduleError } = await admin.from('modules').select('id,content').eq('owner',owner);
        if (moduleError) throw new Error('Unable to inspect local QA modules.');
        const moduleIds = modules.filter(r => /^(QA|WORKFLOW|BROWSER) SYNTHETIC\b/.test(r.content.title)).map(r=>r.id);
        if (moduleIds.length) {
            const { error } = await admin.from('modules').delete().eq('owner',owner).in('id',moduleIds);
            if (error) throw new Error('Unable to remove local QA modules.');
        }
    }
    console.log('Explicitly labelled local QA records removed.');
} else throw new Error('Use setup or clean.');
