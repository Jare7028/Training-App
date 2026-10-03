'use client';
import type { Attempt } from '@/lib/assessment';
import { reviewCriteria, formatTime, workDuration } from '@/lib/assessment';
import { assignedContent, candidateMetrics, hiringStage } from '@/lib/candidate-tools';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
export default function CandidateComparison({candidates,open,onClose,onReview}:{candidates:Attempt[];open:boolean;onClose:()=>void;onReview:(a:Attempt)=>void}){
    const differing=new Set(candidates.map(assignedContent)).size>1;
    return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}}><DialogContent className="comparison-dialog"><DialogHeader><DialogTitle>Compare candidates</DialogTitle><DialogDescription className="sr-only">Assigned assessments, objective results, typing evidence and human ratings.</DialogDescription></DialogHeader>{differing&&<p className="comparison-notice">Different assessment content or settings</p>}<div className="comparison-grid">{candidates.map(a=>{
        const metrics=candidateMetrics(a),criteria=reviewCriteria(a.modules);
        return <section className="comparison-candidate" key={a.id}><header><h2>{a.alias}</h2><p>{a.title}</p><span className="hiring-stage">{hiringStage(a)}</span></header><dl className="comparison-summary"><dt>Status</dt><dd>{a.status==='completed'?'Submitted':a.status==='in-progress'?'In progress':'Not started'}{a.revoked?' · Link revoked':''}</dd><dt>Assigned time</dt><dd>{formatTime(workDuration(a))}</dd><dt>Objective answers</dt><dd>{metrics.total?`${metrics.correct} of ${metrics.total} · ${metrics.accuracy}%`:'—'}</dd><dt>Writing review</dt><dd>{a.status!=='completed'?'Not submitted':a.review?.outcome==='not-scorable'?'Not scorable':metrics.writing!==null?`${metrics.writing} / ${metrics.writingMax}`:a.modules.some(m=>m.kind==='writing')?'Awaiting review':'Not required'}</dd></dl>
        {!!a.result&&<div className="comparison-modules">{a.result.modules.filter(m=>m.kind!=='writing').map(m=><div key={m.id}><h3>{m.title}</h3>{m.kind==='typing'?<><p>{m.netWpm??'—'} correct-character WPM · {m.accuracy??'—'}% accuracy</p><small>{m.administration||'Legacy target score'}{m.ceiling?' · Full passage completed':''}</small></>:<p>{m.correct??'—'} of {m.total??'—'} correct</p>}</div>)}</div>}
        {metrics.writing!==null&&<div className="comparison-rubric"><h3>Human ratings</h3>{criteria.map((r,i)=><p key={r.key+':'+i}><span>{r.moduleTitle} · {r.title}</span><strong>{a.review!.ratings[r.key]} / {r.max}</strong></p>)}</div>}
        <Button variant="outline" onClick={()=>onReview(a)}>Open candidate</Button></section>;
    })}</div></DialogContent></Dialog>;
}
