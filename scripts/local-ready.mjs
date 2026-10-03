import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
const status = spawnSync(process.execPath, ['scripts/supabase-cli.mjs', 'status', '-o', 'json'], { encoding: 'utf8' });
if (status.status !== 0) throw new Error('Local Supabase status is unavailable.');
const info = JSON.parse(status.stdout);
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(info.API_URL)) throw new Error('Refusing non-local readiness target.');
const health = await fetch(`${info.API_URL}/auth/v1/health`);
if (!health.ok) throw new Error('Local authentication API is unavailable.');
const db = createClient(info.API_URL, info.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
for (const table of ['assessments', 'modules', 'attempts', 'preview_attempts', 'workspace_members']) {
    const { error } = await db.from(table).select('id').limit(1);
    if (error) throw new Error(`Local ${table} table is unavailable (${error.code}).`);
}
console.log('Local authentication and all five PostgreSQL tables respond successfully.');
