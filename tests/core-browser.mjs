import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {checkTypingInteraction} from './typing-browser-checks.mjs';
import {prefixTypingScore} from '../lib/assessment.ts';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const base='http://127.0.0.1:5173';
const content=JSON.parse(readFileSync('content/customer-service-core-v1.json','utf8'));
content.config.oneQuestionAtATime=false;content.config.allowBackNavigation=true; // This fixture verifies the optional reviewable journey.
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
const results=[];mkdirSync('test-results/core',{recursive:true});
function pass(name){results.push({test:name,status:'PASS'});writeFileSync('test-results/core/browser-results.json',JSON.stringify(results,null,2));console.log('PASS:',name);}
async function audit(page,name){await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.playState==='running'&&Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));});const r=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));pass(name);}
async function api(page,body){const result=await page.evaluate(async body=>{const r=await fetch('/api/admin',{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};},body);assert.equal(result.status,200);return result.data;}
async function autosave(page,change){const wait=page.waitForResponse(r=>r.url().endsWith('/api/candidate')&&r.request().method()==='POST'&&r.request().postDataJSON().action==='save'&&r.ok());await change();await wait;}
const reply=content.modules[3].example;
try{
for(const [device,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1440,height:1000}]]){
 const adminContext=await browser.newContext({viewport});const admin=await adminContext.newPage();const errors=[];admin.on('pageerror',e=>errors.push(e.message));
 await admin.goto(base+'/login');await admin.getByLabel('Email address',{exact:true}).fill('recruiter@qa.invalid');await admin.getByLabel('Password',{exact:true}).fill('Local-QA-Only-57!Password');await admin.getByRole('button',{name:'Sign in',exact:true}).click();await admin.getByRole('heading',{name:'Assessments',exact:true}).waitFor();
 const title=`BROWSER SYNTHETIC Core ${device} ${Date.now()}`,alias=`BROWSER SYNTHETIC Core candidate ${device} ${Date.now()}`;
 const assessment=structuredClone(content);assessment.title=title;assessment.config.code='QA-CORE-CHECK';
 const created=await api(admin,{action:'save',assessment});
 await admin.reload();await admin.getByRole('heading',{name:title,exact:true}).waitFor();
 const card=admin.locator('.assessment-card').filter({has:admin.getByRole('heading',{name:title,exact:true})});
 await card.getByRole('button',{name:'Edit assessment'}).click();assert.equal(await admin.getByLabel('Work timer (seconds)',{exact:true}).inputValue(),'530');
 await admin.getByRole('button',{name:/Write a service recovery reply/}).first().click();await admin.getByLabel('Criterion 5 title',{exact:true}).waitFor();
 await admin.getByLabel('Criterion 5 title',{exact:true}).fill('Written language');await audit(admin,device+' editable assessment and five-criterion rubric');
 await admin.getByRole('button',{name:'Save & mark ready',exact:true}).click();await admin.getByRole('heading',{name:'Assessment builder',exact:true}).waitFor({state:'hidden'});
 const assignment=await api(admin,{action:'link',id:created.id,alias});
 const candidateContext=await browser.newContext({viewport});const candidate=await candidateContext.newPage();candidate.setDefaultTimeout(20000);candidate.on('pageerror',e=>errors.push(e.message));
 await candidate.goto(base+assignment.path);await candidate.getByRole('heading',{name:title,exact:true}).waitFor();await audit(candidate,device+' shared-timer welcome');
 await candidate.getByRole('checkbox').check();await candidate.getByRole('button',{name:'Start assessment',exact:true}).click();await candidate.locator('.candidate-question').first().waitFor();
 await autosave(candidate,async()=>{for(const [i,key] of [1,0].entries())await candidate.locator('.candidate-question').nth(i).getByRole('radio').nth(key).check();});
 const token=assignment.path.split('/').at(-1);const before=await candidate.evaluate(async token=>(await fetch('/api/candidate?token='+token)).json(),token);
 await candidate.reload();await candidate.locator('.candidate-question').first().waitFor();const after=await candidate.evaluate(async token=>(await fetch('/api/candidate?token='+token)).json(),token);assert.equal(after.deadline,before.deadline);assert.ok(await candidate.locator('.candidate-question').first().getByRole('radio').nth(1).isChecked());
 await candidate.getByRole('button',{name:'Save & continue',exact:true}).click();await candidate.getByRole('button',{name:'Start 60-second task',exact:true}).waitFor();
 await audit(candidate,device+' deliberate typing setup');
 const preTyping=await candidate.evaluate(async token=>(await fetch('/api/candidate?token='+token)).json(),token);
 await candidate.getByText('Optional unscored practice',{exact:true}).click();await candidate.getByLabel('Typing practice',{exact:true}).pressSequentially('Practice', {delay:10});
 assert.equal((await candidate.evaluate(async token=>(await fetch('/api/candidate?token='+token)).json(),token)).answer.typing,undefined);
 assert.equal(preTyping.answer.typing,undefined);pass(device+' editable practice is interactive and never starts the measured timer');
 await candidate.getByRole('button',{name:'Start 60-second task',exact:true}).click();await candidate.getByLabel('Your typed copy',{exact:true}).waitFor();
 const typingStart=await candidate.evaluate(async token=>(await fetch('/api/candidate?token='+token)).json(),token);
 await checkTypingInteraction(candidate,content.modules[1].passage,pass,audit,device,`test-results/core/${device}-typing.png`);
 const typingAfter=await candidate.evaluate(async token=>(await fetch('/api/candidate?token='+token)).json(),token);
 assert.equal(typingAfter.answer.typing.deadline,typingStart.answer.typing.deadline);assert.equal(typingAfter.deadline,typingStart.deadline);

 if(device==='desktop'){
   await autosave(candidate,()=>candidate.getByLabel('Your typed copy',{exact:true}).fill(content.modules[1].passage.slice(0,120)));
   await candidate.getByText('Typing saved and locked.',{exact:false}).waitFor({timeout:70000});
   pass('desktop normal 60-second typing completes automatically');
 }else{
   await autosave(candidate,()=>candidate.getByLabel('Your typed copy',{exact:true}).fill(content.modules[1].passage));
   await candidate.reload();await candidate.getByLabel('Your typed copy',{exact:true}).waitFor();
   await candidate.getByRole('button',{name:'Finish complete passage early',exact:true}).click();await candidate.getByText('Typing saved and locked.',{exact:false}).waitFor();
   pass('mobile typing refresh retains text and records technical interruption');
 }
 assert.ok(await candidate.getByLabel('Your typed copy',{exact:true}).evaluate(n=>n.readOnly));
 await candidate.getByRole('button',{name:'Save & continue',exact:true}).click();await candidate.locator('.candidate-question').first().waitFor();assert.equal(await candidate.locator('.candidate-question').count(),1);
 await candidate.locator('.candidate-question').first().getByRole('radio').nth(1).check();await candidate.locator('.candidate-question').nth(1).waitFor();
 await autosave(candidate,()=>candidate.locator('.candidate-question').nth(1).getByRole('radio').nth(2).check());await audit(candidate,device+' developing policy case');
 await candidate.getByRole('button',{name:'Save & continue',exact:true}).click();await candidate.getByLabel('Your reply to the customer',{exact:true}).waitFor();
 await autosave(candidate,()=>candidate.getByLabel('Your reply to the customer',{exact:true}).fill(reply));await candidate.reload();await candidate.getByLabel('Your reply to the customer',{exact:true}).waitFor();assert.equal(await candidate.getByLabel('Your reply to the customer',{exact:true}).inputValue(),reply);await audit(candidate,device+' saved writing and mobile reflow');
 await candidate.getByRole('button',{name:'Review answers',exact:true}).click();await candidate.getByRole('heading',{name:'Review your answers',exact:true}).waitFor();await audit(candidate,device+' review and editable answers');
 await candidate.getByRole('button',{name:'Review section 1',exact:true}).click();await candidate.locator('.candidate-question').first().waitFor();assert.ok(await candidate.locator('.candidate-question').first().getByRole('radio').nth(1).isChecked());
 await candidate.getByRole('button',{name:'4. Write a service recovery reply',exact:true}).click();await candidate.getByRole('button',{name:'Review answers',exact:true}).click();await candidate.getByRole('button',{name:'Submit assessment',exact:true}).click();await candidate.getByRole('button',{name:'Confirm submission',exact:true}).click();await candidate.getByRole('heading',{name:'Your responses have been submitted',exact:true}).waitFor();await candidate.reload();await candidate.getByRole('heading',{name:'Your responses have been submitted',exact:true}).waitFor();await candidate.screenshot({path:`test-results/core/${device}-complete.png`,fullPage:true});
 pass(device+' signed-out four-module completion, refresh and answer review');
 await admin.reload();await admin.getByRole('heading',{name:'Assessments',exact:true}).waitFor();if(device==='mobile')await admin.getByRole('button',{name:'Toggle Sidebar'}).click();await admin.getByRole('button',{name:/^Candidate review/}).click();if(device==='mobile')await admin.keyboard.press('Escape');await admin.getByRole('heading',{name:'Candidate review',exact:true}).waitFor();await admin.getByRole('textbox',{name:'Search candidates'}).fill(alias);await admin.getByRole('button',{name:`Review ${alias}`,exact:true}).click();await admin.locator('.candidate-response').filter({hasText:reply}).waitFor();
 for(const criterion of content.modules[3].rubric){const radio=admin.getByRole('radiogroup',{name:criterion.title,exact:true}).getByRole('radio').nth(3);await radio.focus();await radio.press('Space');assert.ok(await radio.isChecked());await admin.getByLabel('Evidence: '+criterion.title,{exact:true}).fill('Quote: '+reply.slice(0,180));}
 await admin.getByLabel('Review notes & evidence',{exact:true}).fill('Specific acknowledgement, accurate choices and a 16:00 follow-up.');await audit(admin,device+' five evidence-based human ratings');await Promise.all([admin.waitForResponse(r=>r.url().endsWith('/api/admin')&&r.request().method()==='POST'&&r.request().postDataJSON().action==='review'&&r.ok()),admin.getByRole('button',{name:'Save human review',exact:true}).click()]);await admin.getByText(/Last reviewed/).waitFor();
 const stored=(await api(admin)).attempts.find(a=>a.id===assignment.id);assert.equal(stored.result.objectiveCorrect,4);assert.equal(stored.result.objectiveTotal,4);assert.equal(Object.keys(stored.review.ratings).length,5);assert.equal(stored.result.modules.find(m=>m.kind==='typing').administration,device==='desktop'?'Measured':'Incomplete — technical review');const savedTyping=stored.result.modules.find(m=>m.kind==='typing');const typingAnswer=stored.answers[content.modules[1].id];const expectedTyping=prefixTypingScore(typingAnswer.text,content.modules[1].passage,typingAnswer.typing.seconds);for(const key of ['grossWpm','netWpm','accuracy','errors','seconds'])assert.equal(savedTyping[key],expectedTyping[key]);pass(device+' saved automatic typing measurements match confirmed text and server duration');
 await admin.getByLabel('Review notes & evidence',{exact:true}).fill('Revised review: '+reply.slice(0,120));await Promise.all([admin.waitForResponse(r=>r.url().endsWith('/api/admin')&&r.request().method()==='POST'&&r.request().postDataJSON().action==='review'&&r.ok()),admin.getByRole('button',{name:'Save human review',exact:true}).click()]);await admin.getByText(/Last reviewed/).waitFor();await admin.screenshot({path:`test-results/core/${device}-review.png`,fullPage:true});const revised=(await api(admin)).attempts.find(a=>a.id===assignment.id);assert.equal(revised.review.history.length,1);assert.deepEqual(errors,[]);pass(device+' persisted decision counts, typing observations and review audit trail');
 await candidateContext.close();await adminContext.close();
}
}finally{await browser.close();}
console.log(results.length+' core browser checks passed');
