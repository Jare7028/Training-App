#!/usr/bin/env python3
"""Live local regression checks for the module-library and public candidate workflow."""
import copy, http.cookiejar, json, os, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
BASE = os.environ.get('ASSESS_QA_BASE', 'http://127.0.0.1:5173').rstrip('/')
if not BASE.startswith(('http://127.0.0.1:', 'http://localhost:')):
    raise SystemExit('Refusing non-loopback QA target')
OUT = os.environ.get('ASSESS_WORKFLOW_OUT', 'tests/workflow-results.json')
results = []
def client():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
owner, other, guest, signedout = [client() for _ in range(4)]
def request(c, path, body=None):
    req = urllib.request.Request(BASE+path, data=None if body is None else json.dumps(body).encode(), headers={'Content-Type':'application/json'} if body is not None else {})
    try:
        r=c.open(req,timeout=30);status=r.status;raw=r.read().decode()
    except urllib.error.HTTPError as e:
        status=e.code;raw=e.read().decode()
    try: return status,json.loads(raw)
    except ValueError: return status,raw

def check(name, ok):
    results.append({'test':name,'status':'PASS' if ok else 'FAIL'})
    print(results[-1],flush=True)
    with open(OUT,'w') as f: json.dump(results,f,indent=2)
    if not ok: raise AssertionError(name)
def good(c,path,body=None):
    s,d=request(c,path,body)
    if s!=200: raise RuntimeError(f'{path}: HTTP {s}: {d}')
    return d

def admin(body,c=owner): return good(c,'/api/admin',body)
def workspace(c=owner):return good(c,'/api/admin')
def candidate(token,body=None,c=signedout):
    return good(c, '/api/candidate?token='+token) if body is None else good(c,'/api/candidate',dict(body,token=token))
def link(id,preview=False):
    d=admin({'action':'preview' if preview else 'link','id':id,'alias':'WORKFLOW SYNTHETIC Candidate'})
    return d['id'],d['path'].split('/')[-1]

try:
    for c,email in [(owner,'recruiter@qa.invalid'),(other,'second@qa.invalid'),(guest,'guest@qa.invalid')]:good(c,'/auth/login',{'email':email,'password':'Local-QA-Only-57!Password'})
    check('unsigned admin API is protected', request(signedout,'/api/admin')[0]==401)
    check('authenticated non-admin is denied',request(guest,'/api/admin')[0]==401)
    check('authenticated non-member sees business setup without workspace data', 'Set up your business' in good(guest,'/') and 'Customer support essentials' not in good(guest,'/'))
    data=workspace();count=len(data['attempts'])
    check('sample seed action removed',request(owner,'/api/admin',{'action':'seed'})[0]==400 and len(workspace()['attempts'])==count)
    check('professional default remains nine minutes',sum(m['seconds'] for m in data['presets'])==540 and all(q['explanation'] for m in data['presets'] for q in m.get('questions',[])))
    m=copy.deepcopy(next(m for m in data['presets'] if m['kind']=='problem'));m['title']='WORKFLOW SYNTHETIC Investigation';m['seconds']=15
    id=admin({'action':'save-module','module':m})['id']
    saved=next(r for r in workspace()['library'] if r['id']==id)
    check('create reusable module persists',saved['module']==m and saved['revision']==1)
    changed=copy.deepcopy(m);changed['title']+=' updated'
    s,d=request(other,'/api/admin',{'action':'save-module','id':id,'revision':1,'module':changed})
    check('second owner cannot update module',s==404)
    s,d=request(other,'/api/admin',{'action':'save','assessment':{'id':id,'title':'foreign','description':'','status':'ready','modules':[m],'revision':1}})
    check('foreign assessment IDs cannot become new records',s==404)
    admin({'action':'save-module','id':id,'revision':1,'module':changed})
    check('edit reusable module persists',next(r for r in workspace()['library'] if r['id']==id)['revision']==2)
    check('stale module edit rejected',request(owner,'/api/admin',{'action':'save-module','id':id,'revision':1,'module':m})[0]==409)
    bad=copy.deepcopy(m);bad['questions'][0]['explanation']=' '
    check('objective modules require scoring explanation',request(owner,'/api/admin',{'action':'save-module','module':bad})[0]==400)
    check('malformed module rejected',request(owner,'/api/admin',{'action':'save-module','module':None})[0]==400)
    a={'id':'','title':'WORKFLOW SYNTHETIC Assessment','description':'Support scenario','status':'ready','modules':[copy.deepcopy(changed)],'updatedAt':0,'revision':0}
    write=copy.deepcopy(next(m for m in data['presets'] if m['kind']=='writing'));write['seconds']=15;a['modules'].append(write)
    aid=admin({'action':'save','assessment':a})['id']
    # Library updates must not silently rewrite existing assessments or links.
    changed['questions'][0]['correct']=1
    admin({'action':'save-module','id':id,'revision':2,'module':changed})
    check('assessment owns a copy of library content',next(t for t in workspace()['assessments'] if t['id']==aid)['modules'][0]['questions'][0]['correct']==0)
    pid,ptoken=link(aid,True)
    check('preview creates no candidate record',len(workspace()['attempts'])==count and all(r['id']!=pid for r in workspace()['attempts']))
    check('preview is inaccessible when signed out',request(signedout,'/api/candidate?token='+ptoken)[0]==404)
    check('preview cannot be accessed by another owner',request(other,'/api/candidate?token='+ptoken)[0]==404)
    p=candidate(ptoken,c=owner);p=candidate(ptoken,{'action':'start','revision':p['revision']},owner)
    p=candidate(ptoken,{'action':'advance','revision':p['revision'],'answer':{'choices':{q['id']:q['correct'] for q in a['modules'][0]['questions']}}},owner)
    p=candidate(ptoken,{'action':'advance','revision':p['revision'],'answer':{'text':'A preview reply.'}},owner)
    check('completed preview remains separate from candidate results',p['status']=='completed' and len(workspace()['attempts'])==count)
    attempt,token=link(aid)
    view=candidate(token)
    record=next(r for r in workspace()['attempts'] if r['id']==attempt)
    check('candidate link has seven-day expiry',abs(record['expiresAt']-record['createdAt']-7*86400000)<1000 and not record['revoked'])
    check('candidate page is accessible signed out',request(signedout,'/take/'+token)[0]==200)
    check('second owner sees no foreign assessments modules or results',all(t['id']!=aid for t in workspace(other)['assessments']) and all(r['id']!=id for r in workspace(other)['library']) and all(r['id']!=attempt for r in workspace(other)['attempts']))
    check('second owner cannot generate foreign link or preview',all(request(other,'/api/admin',{'action':act,'id':aid,'alias':'foreign'})[0]==404 for act in ['link','preview']))
    check('second owner cannot revoke foreign link',request(other,'/api/admin',{'action':'revoke','id':attempt,'revision':record['revision']})[0]==409)
    view=candidate(token,{'action':'start','revision':view['revision']})
    check('candidate responses strip keys and explanations',all('correct' not in q and 'explanation' not in q for q in view['module']['questions']) and 'result' not in view and 'owner' not in view)
    answer={'choices':{q['id']:q['correct'] for q in a['modules'][0]['questions']}}
    view=candidate(token,{'action':'save','revision':view['revision'],'answer':answer})
    resume=candidate(token)
    check('refresh restores answers without restarting timer',resume['answer']==answer and resume['deadline']==view['deadline'] and resume['startedAt']==view['startedAt'])
    view=candidate(token,{'action':'advance','revision':resume['revision'],'answer':answer})
    reply='I understand that the delay has affected your gift. I will contact the courier now and update you within one working day. If the courier confirms loss, we can offer a replacement. You do not need to share payment details.'
    view=candidate(token,{'action':'save','revision':view['revision'],'answer':{'text':reply}})
    check('written autosave survives refresh',candidate(token)['answer']['text']==reply)
    view=candidate(token,{'action':'advance','revision':view['revision'],'answer':{'text':reply}})
    done=next(r for r in workspace()['attempts'] if r['id']==attempt)
    check('completed result has objective score and ungraded writing',view['status']=='completed' and done['result']['objective']==100 and next(m for m in done['result']['modules'] if m['kind']=='writing')['score'] is None and done['answers'][write['id']]['text']==reply)
    duplicate=candidate(token,{'action':'advance','revision':1,'answer':{'text':'replacement'}})
    check('duplicate submissions do not change result',duplicate['status']=='completed' and next(r for r in workspace()['attempts'] if r['id']==attempt)['answers']==done['answers'])
    check('candidate completion never exposes scores or keys','result' not in duplicate and duplicate['module'] is None)
    review={'ratings':{'accuracy':4,'empathy':3,'clarity':4,'ownership':4},'notes':'Accurate courier investigation and one-day follow-up; specific acknowledgment could be stronger.','outcome':'reviewed'}
    check('another owner cannot review foreign result',request(other,'/api/admin',{'action':'review','id':attempt,'revision':done['revision'],'review':review})[0]==404)
    admin({'action':'review','id':attempt,'revision':done['revision'],'review':review})
    reviewed=next(r for r in workspace()['attempts'] if r['id']==attempt)
    check('human review persists independently',reviewed['review']['ratings']==review['ratings'] and reviewed['result']==done['result'])
    rid,rtoken=link(aid);r=next(r for r in workspace()['attempts'] if r['id']==rid)
    admin({'action':'revoke','id':rid,'revision':r['revision']})
    check('revoked link cannot start or load',request(signedout,'/api/candidate?token='+rtoken)[0]==404 and request(signedout,'/api/candidate',{'token':rtoken,'action':'start','revision':1})[0]==404)
    print(json.dumps({'passed':len(results),'failed':0}),flush=True)
except Exception as e:
    results.append({'test':'WORKFLOW BLOCKER','status':'FAIL','error':str(e)})
    with open(OUT,'w') as f:json.dump(results,f,indent=2)
    raise
