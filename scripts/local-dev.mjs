// Isolate the QA server from any hosted-project variables injected by the cloud.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const file = readFileSync(path.join(root, '.env.local'), 'utf8');
if (!file.startsWith('# Generated local QA configuration')) throw new Error('Run npm run test:setup to prepare an isolated local configuration.');
const values = Object.fromEntries(file.split('\n').filter(l => l.includes('=')).map(l => [l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(values.NEXT_PUBLIC_SUPABASE_URL)) throw new Error('Refusing non-local development configuration.');
const mode = process.argv[2] || 'dev';
if (!['dev', 'start', 'build'].includes(mode)) throw new Error('Use dev, start or build.');
const args = [path.join(root, 'node_modules/next/dist/bin/next'), mode];
if (mode !== 'build') args.push('--hostname', '127.0.0.1', '--port', '5173');
const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...values } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
