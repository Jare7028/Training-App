import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/admin';
import { hashToken } from '@/db/store';
import { sameOrigin } from '@/lib/request-origin';
import { Assessment, workDuration } from '@/lib/assessment';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, {status, headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const validToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const unavailable = () => json({error:'This assessment link is unavailable.'},404);
export async function GET(request: Request) {
    try {
        const token = new URL(request.url).searchParams.get('token');
        if (!validToken(token)) return unavailable();
        const {data,error} = await serviceClient().from('general_links').select('snapshot,expires_at,revoked').eq('share_token',token).maybeSingle();
        if (error) throw error;
        if (!data || data.revoked || data.expires_at <= Date.now()) return unavailable();
        const test = data.snapshot as Assessment;
        return json({title:test.title,description:test.description,seconds:workDuration(test)});
    } catch { return json({error:'The assessment is temporarily unavailable. Please retry.'},503); }
}
export async function POST(request: Request) {
    try {
        if (!sameOrigin(request)) return json({error:'Invalid request origin.'},403);
        if (Number(request.headers.get('content-length') || 0)>2000) return json({error:'Request is too large.'},413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length>2000) return json({error:'Request is too large.'},413);
        let body;
        try { body = JSON.parse(raw); } catch { return json({error:'Invalid request.'},400); }
        if (!body || !validToken(body.token) || !validToken(body.attemptToken)) return json({error:'Invalid request.'},400);
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.length>80 || /[\u0000-\u001f\u007f]/.test(body.name)) return json({error:'Enter your name (up to 80 characters).'},400);
        const {data,error} = await serviceClient().rpc('register_general_candidate',{link_token:body.token,candidate_name:body.name.trim(),attempt_hash:await hashToken(body.attemptToken)});
        if (error) throw error;
        if (!data) return unavailable();
        return json({path:`/take/${body.attemptToken}`});
    } catch { return json({error:'We could not open your assessment. Please retry.'},503); }
}
