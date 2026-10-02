import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {checkTypingInteraction} from './typing-browser-checks.mjs';
import {typingScore,prefixTypingScore} from '../lib/assessment.ts';
const base='http://127.0.0.1:5173';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
let checks=0;const pass=name=>{checks++;console.log('PASS:',name);};
mkdirSync('test-results/core',{recursive:true});
async function api(page,body){const result=await page.evaluate(async body=>{const r=await fetch('/api/admin',{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};},body);assert.equal(result.status,200);return result.data;}
try {
    const admin=await browser.newPage();await admin.goto(base+'/login');await admin.getByLabel('Email address',{exact:true}).fill('recruiter@qa.invalid');await admin.getByLabel('Password',{exact:true}).fill('Local-QA-Only-57!Password');await admin.getByRole('button',{name:'Sign in',exact:true}).click();await admin.getByRole('heading',{name:'Assessments',exact:true}).waitFor();
    const passage=('Update the case notes accurately before handing the ticket to the next adviser. Confirm the order number, explain what has been checked, and record the next promised update. Keep the customer informed even when the investigation is still open. ').repeat(4).trim();
    for(const shared of [false,true]) {
    const typingModule={id:'legacy-typing',kind:'typing',title:'Editable legacy typing',seconds:15,instructions:'Copy these case notes.',passage,targetWpm:45};
    const assessment=await api(admin,{action:'save',assessment:{id:'',title:'BROWSER SYNTHETIC Legacy typing '+Date.now(),...(shared?{config:{flexible:true,workSeconds:90,introductionSeconds:0,code:'Legacy shared test',supportEmail:'',spellCheck:true,toolPolicy:'Type the supplied passage.',notice:'Synthetic QA'}}:{}),description:'Typing compatibility check',status:'ready',modules:[typingModule],revision:0,updatedAt:0}});
    const assignment=await api(admin,{action:'link',id:assessment.id,alias:'BROWSER SYNTHETIC Legacy typing'});
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    await page.goto(base+assignment.path);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Start assessment',exact:true}).click();if(shared)await page.getByRole('button',{name:'Start 15-second task',exact:true}).click();await page.getByLabel('Your typed copy',{exact:true}).waitFor();
    const audit=async(page,name)=>{const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[]);pass(name);};
    await checkTypingInteraction(page,passage,pass,audit,shared?'shared legacy':'legacy',`test-results/core/${shared?'shared-':''}legacy-typing.png`);
    const text=await page.getByLabel('Your typed copy',{exact:true}).inputValue();
    if(shared){await page.getByText('Typing saved and locked.',{exact:false}).waitFor({timeout:25000});assert.ok(await page.getByLabel('Your typed copy',{exact:true}).evaluate(n=>n.readOnly));await page.getByRole('button',{name:'Review answers',exact:true}).click();await page.getByRole('button',{name:'Submit assessment',exact:true}).click();await page.getByRole('button',{name:'Confirm submission',exact:true}).click();await page.getByRole('heading',{name:'Your responses have been submitted',exact:true}).waitFor();}
    else await page.getByRole('heading',{name:/You’re all done/}).waitFor({timeout:25000});
    const stored=(await api(admin)).attempts.find(a=>a.id===assignment.id),expected=typingScore(text,passage,15,45),actual=stored.result.modules[0];
    for(const key of ['score','grossWpm','netWpm','accuracy','errors','seconds'])assert.equal(actual[key],expected[key]);
    assert.equal(stored.answers[typingModule.id].text,text);pass((shared?'shared ':'')+'legacy editable passage, timer expiry, saved response and automatic target scoring remain compatible');
    await context.close();}
    const measured={id:'measured-custom',kind:'typing',title:'BROWSER SYNTHETIC Measured module',seconds:60,instructions:'Copy the supplied notes.',passage,typingMode:'prefix-v1',practice:'An editable practice sentence.'};
    await api(admin,{action:'save-module',module:measured});
    const blankTitle='BROWSER SYNTHETIC Blank measured assessment '+Date.now();
    const blank=await api(admin,{action:'save',assessment:{id:'',title:blankTitle,description:'Custom module check',status:'draft',modules:[],revision:0,updatedAt:0}});
    await admin.reload();await admin.locator('.assessment-card').filter({has:admin.getByRole('heading',{name:blankTitle,exact:true})}).getByRole('button',{name:'Edit assessment',exact:true}).click();
    await admin.getByRole('button',{name:'Add module',exact:true}).click();await admin.getByRole('dialog',{name:'Add a module',exact:true}).getByRole('button',{name:/BROWSER SYNTHETIC Measured module/}).click();
    assert.equal(await admin.getByLabel('Work timer (seconds)',{exact:true}).inputValue(),'90');await admin.getByText('Separate speed and accuracy typing uses the shared work timer.',{exact:true}).waitFor();
    await admin.getByRole('button',{name:'Save & mark ready',exact:true}).click();await admin.getByRole('heading',{name:'Assessment builder',exact:true}).waitFor({state:'hidden'});
    pass('adding a saved measured module enables an editable work timer in the assessment builder');
    const saved=(await api(admin)).assessments.find(a=>a.id===blank.id);assert.equal(saved.config.workSeconds,90);assert.equal(saved.config.flexible,true);
    const link=await api(admin,{action:'link',id:blank.id,alias:'BROWSER SYNTHETIC Blank measured candidate'});
    const customContext=await browser.newContext(),custom=await customContext.newPage();await custom.goto(base+link.path);await custom.getByRole('checkbox').check();await custom.getByRole('button',{name:'Start assessment',exact:true}).click();await custom.getByRole('button',{name:'Start 60-second task',exact:true}).click();await custom.getByLabel('Your typed copy',{exact:true}).fill(passage);await custom.getByRole('button',{name:'Finish complete passage early',exact:true}).click();await custom.getByText('Typing saved and locked.',{exact:false}).waitFor();
    const token=link.path.split('/').at(-1),confirmed=await custom.evaluate(async token=>(await fetch('/api/candidate?token='+token)).json(),token),expected=prefixTypingScore(passage,passage,confirmed.answer.typing.seconds);
    assert.equal(await custom.locator('[data-typing-wpm]').innerText(),expected.grossWpm.toFixed(1)+'WPM');assert.equal((await custom.locator('[data-typing-accuracy]').innerText()).trim(),'100.0%');
    await custom.getByRole('button',{name:'Review answers',exact:true}).click();await custom.getByRole('button',{name:'Submit assessment',exact:true}).click();await custom.getByRole('button',{name:'Confirm submission',exact:true}).click();await custom.getByRole('heading',{name:'Your responses have been submitted',exact:true}).waitFor();const record=(await api(admin)).attempts.find(a=>a.id===link.id);assert.equal(record.result.modules[0].grossWpm,expected.grossWpm);assert.equal(record.result.modules[0].seconds,expected.seconds);
    pass('reused editable module in a blank assessment starts deliberately and early results use exact server duration');
} finally {await browser.close();}
console.log(checks+' legacy typing checks passed');
