import { reviewCriteria, type Attempt } from './assessment';
import { csvCell } from './analytics-export';

export const hiringStages = ['Unassigned', 'Shortlisted', 'Interview', 'On hold', 'Not proceeding', 'Hired'];
export const hiringStage = (a: Attempt) => a.hiring?.stage || 'Unassigned';
export const copyTitle = (title: string) => `${title.slice(0, 113)} (copy)`;

export function candidateMetrics(a: Attempt) {
    const objective = a.result?.modules.filter(m => m.kind !== 'typing' && m.kind !== 'writing' && Number.isFinite(m.correct) && Number.isFinite(m.total) && m.total! > 0) || [];
    const correct = objective.reduce((sum,m)=>sum+m.correct!,0), total = objective.reduce((sum,m)=>sum+m.total!,0);
    const criteria = reviewCriteria(a.modules), complete = !!a.review && a.review.outcome !== 'not-scorable' && criteria.length > 0 && criteria.every(r=>Number.isInteger(a.review!.ratings[r.key]) && a.review!.ratings[r.key]>=0 && a.review!.ratings[r.key]<=r.max);
    return {correct,total,accuracy:total?Math.round(correct/total*1000)/10:null,
        writing:complete?criteria.reduce((sum,r)=>sum+a.review!.ratings[r.key],0):null,
        writingMax:criteria.reduce((sum,r)=>sum+r.max,0)};
}

// Compare actual assigned content, not record IDs or mutable library titles.
// Timing, assistance rules, answer keys and rubric anchors affect comparability.
export function assignedContent(a: Attempt) {
    const omit = new Set(['id','optionIds','correctOptionId','version','code']);
    function canonical(value: unknown): unknown {
        if(Array.isArray(value)) return value.map(canonical);
        if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([k,v])=>!omit.has(k)&&v!==undefined).sort(([a,b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
        return value;
    }
    return JSON.stringify(canonical({modules:a.modules,config:a.config}));
}
export function candidateCsv(attempts: Attempt[]) {
    const rows: (string|number|null)[][] = [['Candidate','Assessment','Assigned reference','Attempt ID','Assessment status','Hiring stage','Correct answers','Objective questions','Objective accuracy (%)','Typing module','Correct-character WPM','Typing accuracy (%)','Typing administration','Written score','Human rating','Human maximum','Created (UTC)','Submitted (UTC)']];
    for(const a of attempts){
        const metrics = candidateMetrics(a), typing=a.result?.modules.filter(m=>m.kind==='typing') || [];
        for(const t of typing.length?typing:[null]) rows.push([a.alias,a.title,a.config?.code||'',a.id,a.revoked?'revoked':a.status,hiringStage(a),metrics.total?metrics.correct:null,metrics.total||null,metrics.accuracy,t?.title||'',t?.netWpm??null,t?.accuracy??null,t?.administration||(t?'Legacy target score':''),a.review?.outcome||(a.status!=='completed'?'Not submitted':a.modules.some(m=>m.kind==='writing')?'Awaiting scores':'Not required'),metrics.writing,metrics.writing===null?null:metrics.writingMax,new Date(a.createdAt).toISOString(),a.completedAt?new Date(a.completedAt).toISOString():'']);
    }
    return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
