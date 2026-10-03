'use client';
import {useState} from 'react';
import type {Attempt, HiringDecision} from '@/lib/assessment';
import {hiringStage} from '@/lib/candidate-tools';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
export default function HiringPanel({candidate,stages,busy,readOnly,onSave}:{candidate:Attempt;stages:string[];busy:boolean;readOnly:boolean;onSave:(decision:HiringDecision)=>void}){
    const [stage,setStage]=useState(hiringStage(candidate)),[notes,setNotes]=useState(candidate.hiring?.notes||''),[custom,setCustom]=useState(false);
    const dirty=stage.trim()!==hiringStage(candidate)||notes.trim()!==(candidate.hiring?.notes||'');
    return <section className="hiring-panel"><h2>Hiring decision</h2><fieldset disabled={readOnly||busy}><label className="field"><span>Hiring stage</span><Select value={custom?'new':'saved:'+stage} onValueChange={value=>{setCustom(value==='new');setStage(value==='new'?'':value.slice(6));}}><SelectTrigger aria-label="Hiring stage" className="select-field"><SelectValue/></SelectTrigger><SelectContent>{stages.map(value=><SelectItem key={value} value={'saved:'+value}>{value}</SelectItem>)}<SelectItem value="new">Custom stage…</SelectItem></SelectContent></Select></label>{custom&&<label className="field"><span>Custom hiring stage</span><Input aria-label="Custom hiring stage" value={stage} maxLength={50} onChange={e=>setStage(e.target.value)}/></label>}<label className="field"><span>Hiring notes</span><Textarea aria-label="Hiring notes" value={notes} maxLength={5000} rows={3} onChange={e=>setNotes(e.target.value)}/></label>{!readOnly&&<Button disabled={!dirty||!stage.trim()||busy} onClick={()=>onSave({stage,notes,revision:candidate.hiring?.revision||0})}>Save hiring decision</Button>}</fieldset>{candidate.hiring?.updatedAt&&<small>Updated {new Date(candidate.hiring.updatedAt).toLocaleString('en-GB')}{candidate.hiring.updatedBy?` · ${candidate.hiring.updatedBy}`:''}</small>}</section>;
}
