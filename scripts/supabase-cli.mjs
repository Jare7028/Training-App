import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const configHome = path.join(root, '.runtime', 'supabase');
mkdirSync(configHome, { recursive: true });
const result = spawnSync(path.join(root, 'node_modules', '.bin', 'supabase'), process.argv.slice(2), { cwd: root, stdio: 'inherit', env: { ...process.env, SUPABASE_HOME: configHome, SUPABASE_USE_SLIM_IMAGES: process.env.SUPABASE_USE_SLIM_IMAGES || 'true' } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
