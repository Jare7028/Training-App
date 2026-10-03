// Regression for the global business picker in portalled mobile navigation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@supabase/supabase-js';
const text = readFileSync('.env.local', 'utf8'); assert.ok(text.startsWith('# Generated local QA configuration'));
const env = Object.fromEntries(text.split('\n').filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
assert.match(env.NEXT_PUBLIC_SUPABASE_URL, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
let owner, added = false, checks = 0;
async function audit(page, name) { await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {}))); }); const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); assert.deepEqual(report.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.failureSummary) })), []); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); checks++; console.log('PASS:', name); }
try {
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 } }); assert.equal((await context.request.post('/auth/login', { data: { email: 'recruiter@qa.invalid', password: 'Local-QA-Only-57!Password' } })).status(), 200);
    owner = (await (await context.request.get('/api/admin')).json()).userId;
    const existing = await db.from('global_admins').select('user_id').eq('user_id', owner).maybeSingle(); assert.ifError(existing.error);
    if (!existing.data) { assert.ifError((await db.from('global_admins').insert({ user_id: owner })).error); added = true; }
    const page = await context.newPage(); await page.goto('/'); await page.getByRole('button', { name: 'Analytics', exact: true }).click(); await page.waitForFunction(() => !!document.querySelector('.analytics-metric') && !document.querySelector('[aria-label="Loading analytics"]'));
    for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }], ['compact', { width: 320, height: 568 }]]) {
        await page.setViewportSize(viewport); if (device !== 'desktop') await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
        assert.equal(await page.locator('[data-slot="sidebar-header"] select:visible').count(), 1); await audit(page, device + ' global business picker and navigation contrast');
        if (device !== 'desktop') { await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' }); }
        await audit(page, device + ' global-owner Analytics reflow');
    }
} finally { await browser.close(); if (added) assert.ifError((await db.from('global_admins').delete().eq('user_id', owner)).error); }
console.log(checks + ' analytics navigation checks passed');
