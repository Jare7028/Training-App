import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {checkTypingInteraction} from './typing-browser-checks.mjs';
import {typingScore} from '../lib/assessment.ts';
const base='http://127.0.0.1:5173';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
let checks=0;const pass=name=>{checks++;console.log('PASS:',name);};
mkdirSync('test-results/core',{recursive:true});
async function api(page,body){const result=await page.evaluate(async body=>{const r=await fetch('/api/admin',{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};},body);assert.equal(result.status,200);return result.data;}
try {
    const admin=await browser.newPage();await admin.goto(base+'/login');await admin.getByLabel('Email address',{exact:true}).fill('recruiter@qa.invalid');await admin.getByLabel('Password',{exact:true}).fill('Local-QA-Only-57!Password');await admin.getByRole('button',{name:'Sign in',exact:true}).click();await admin.getByRole('heading',{name:'Assessments',exact:true}).waitFor();
    const passage=('Update the case notes accurately before handing the ticket to the next adviser. Confirm the order number, explain what has been checked, and record the next promised update. Keep the customer informed even when the investigation is still open. ').repeat(4).trim();
    const typingModule={id:'legacy-typing',kind:'typing',title:'Editable legacy typing',seconds:15,instructions:'Copy these case notes.',passage,targetWpm:45};
    const assessment=await api(admin,{action:'save',assessment:{id:'',title:'BROWSER SYNTHETIC Legacy typing '+Date.now(),description:'Typing compatibility check',status:'ready',modules:[typingModule],revision:0,updatedAt:0}});
    const assignment=await api(admin,{action:'link',id:assessment.id,alias:'BROWSER SYNTHETIC Legacy typing'});
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    await page.goto(base+assignment.path);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Start assessment',exact:true}).click();await page.getByLabel('Your typed copy',{exact:true}).waitFor();
    const audit=async(page,name)=>{const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(result.violations.map(v=>v.id),[]);pass(name);};
    await checkTypingInteraction(page,passage,pass,audit,'legacy','test-results/core/legacy-typing.png');
    const text=await page.getByLabel('Your typed copy',{exact:true}).inputValue();
    await page.getByRole('heading',{name:/You’re all done/}).waitFor({timeout:25000});
    const stored=(await api(admin)).attempts.find(a=>a.id===assignment.id),expected=typingScore(text,passage,15,45),actual=stored.result.modules[0];
    for(const key of ['score','grossWpm','netWpm','accuracy','errors','seconds'])assert.equal(actual[key],expected[key]);
    assert.equal(stored.answers[typingModule.id].text,text);pass('legacy editable passage, timer expiry, saved response and automatic target scoring remain compatible');
} finally {await browser.close();}
console.log(checks+' legacy typing checks passed');
