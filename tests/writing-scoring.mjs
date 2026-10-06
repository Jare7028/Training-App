import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/writing-scoring.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("from './assessment'",`from '${pathToFileURL(process.cwd()+'/lib/assessment.ts')}'`);
const {scoringInput,validatedWritingReview,parseScoringResponse,scoringSchema,writingModel}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const writingTask={id:'w',kind:'writing',title:'Delay',instructions:'Respond',context:'No delivery date known.',prompt:'Explain next steps',rubric:[{id:'ownership',title:'Ownership',help:'Own the investigation',max:3,anchors:['None','Limited','Clear','Excellent']}]};
const input=scoringInput({modules:[writingTask]}, {w:{text:'I will investigate and update you.'}});
const result={summary:'Clear ownership.',ratings:[{key:'w:ownership',score:3,reason:'Commits to investigation and follow-up.',evidence:[{taskId:'w',quote:'I will investigate'}]}]};
const grade=validatedWritingReview(result,input,1000);assert.equal(grade.ratings['w:ownership'],3);assert.equal(grade.source,'ai');assert.equal(grade.model,'gpt-6-luna');assert.equal(grade.reviewedAt,1000);
for(const mutate of [r=>r.ratings[0].score=4,r=>r.ratings[0].score=1.5,r=>r.ratings[0].key='fake',r=>r.ratings.push(r.ratings[0]),r=>r.ratings=[],r=>r.ratings[0].evidence[0].quote='Invented promise',r=>r.ratings[0].evidence[0].taskId='other',r=>r.ratings[0].evidence=[],r=>r.summary='']){const r=structuredClone(result);mutate(r);assert.throws(()=>validatedWritingReview(r,input,1000),/invalid_output/);}
const empty=scoringInput({modules:[writingTask]},{});assert.throws(()=>validatedWritingReview(result,empty,1),/invalid_output/);const zero=structuredClone(result);zero.ratings[0]={key:'w:ownership',score:0,reason:'No response submitted.',evidence:[]};assert.equal(validatedWritingReview(zero,empty,1).ratings['w:ownership'],0);
const legacy=scoringInput({modules:[{...writingTask,rubric:undefined},{...writingTask,id:'w2',rubric:undefined}]},{});assert.equal(legacy.criteria.length,4);assert.deepEqual(legacy.criteria[0].anchors.map(a=>a.score),[0,2,4]);
const envelope={status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]};assert.deepEqual(parseScoringResponse(envelope),result);assert.throws(()=>parseScoringResponse({...envelope,status:'incomplete'}),/invalid_output/);assert.throws(()=>parseScoringResponse({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}),/refused/);
assert.equal(scoringSchema(input.criteria.map(c=>c.key)).additionalProperties,false);assert.equal(writingModel,'gpt-6-luna');assert.equal(JSON.stringify(input).includes('candidateName'),false);
console.log('PASS: Rubric scales, exact evidence, empty answers, legacy criteria, refusals and incomplete outputs validated.');
