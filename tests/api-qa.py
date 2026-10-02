#!/usr/bin/env python3
"""Synthetic-only bounded QA. Run in same network namespace as local Next.js server.
Creates clearly prefixed synthetic assessments/attempts/reviews; no DB edits or invitations.
"""
import copy, json, os, sys, time, urllib.request, urllib.error, urllib.parse, http.cookiejar, http.client
from concurrent.futures import ThreadPoolExecutor
BASE = os.environ.get('ASSESS_QA_BASE', 'http://127.0.0.1:5173').rstrip('/')
if not BASE.startswith(('http://127.0.0.1:', 'http://localhost:')):
    raise SystemExit('Refusing non-loopback QA target')
OUT = os.environ.get('ASSESS_QA_OUT', os.path.join(os.getcwd(), 'tests', 'qa-results.json'))
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(jar))
plain = urllib.request.build_opener(urllib.request.ProxyHandler({}))
results=[]
runid=str(int(time.time()))

def request(path, body=None, auth=True, headers=None):
    data=None if body is None else json.dumps(body).encode()
    h={'Content-Type':'application/json'} if data is not None else {}
    if headers: h.update(headers)
    req=urllib.request.Request(BASE+path,data=data,headers=h)
    try:
        response=(client if auth else plain).open(req,timeout=30)
        status=response.status; raw=response.read().decode(); hdrs=dict(response.headers)
    except urllib.error.HTTPError as e:
        status=e.code; raw=e.read().decode(); hdrs=dict(e.headers)
    try: value=json.loads(raw)
    except ValueError: value=raw[:500]
    return status,value,hdrs

def rawrequest(path, raw, auth=True, chunked=False):
    url=urllib.parse.urlsplit(BASE);conn=http.client.HTTPConnection(url.hostname,url.port,timeout=30)
    h={'Content-Type':'application/json'}
    if auth:h['Cookie']='; '.join(c.name+'='+c.value for c in jar)
    if chunked:h['Transfer-Encoding']='chunked'
    conn.request('POST',path,body=iter([raw]) if chunked else raw,headers=h,encode_chunked=chunked)
    response=conn.getresponse();status=response.status;data=response.read().decode();conn.close()
    try:value=json.loads(data)
    except ValueError:value=data[:500]
    return status,value

def record(name, ok, observed, expected=None):
    r={'test':name,'status':'PASS' if ok else 'FAIL','observed':observed}
    if expected is not None:r['expected']=expected
    results.append(r); print(json.dumps(r),flush=True)
    with open(OUT,'w') as f:json.dump({'base':BASE,'runid':runid,'tests':results},f,indent=2)

def must(status,data,label):
    if status!=200: raise RuntimeError(f'{label}: HTTP {status}: {data}')
    return data

def admin(body):return request('/api/admin',body)
def cand(token,action,revision,answer=None):
    return request('/api/candidate',{'token':token,'action':action,'revision':revision,'answer':answer or {}},auth=False)
def getcand(token):return request('/api/candidate?token='+token,auth=False)
def findadmin(id):
    data=must(*request('/api/admin')[:2],'admin load')
    return next(x for x in data['attempts'] if x['id']==id)
def create(a):return must(*admin({'action':'save','assessment':a})[:2],'create')['id']
def link(id,label):
    data=must(*admin({'action':'link','id':id,'alias':'QA SYNTHETIC '+runid+' '+label})[:2],'link')
    return data['id'],data['path'].split('/')[-1]
def objective(id='spell',qid='q-spell',seconds=15):
    return {'id':id,'kind':'spelling','title':'QA spelling','seconds':seconds,'instructions':'Choose the literal A.',
        'questions':[{'id':qid,'prompt':'Choose A','options':['A','B'],'correct':0,'explanation':'A is the synthetic key.'}]}
def assessment(mods,status='ready'):
    return {'id':'','title':'QA SYNTHETIC '+runid,'description':'Fictional automated local API test only.','status':status,'modules':mods,'updatedAt':0,'revision':1}
try:
    s,d,h=request('/api/admin',auth=False)
    record('unsigned recruiter API',s==401,{'http':s},401)
    s,d,h=request('/auth/login',{'email':'recruiter@qa.invalid','password':'Local-QA-Only-57!Password'})
    s,d,h=request('/api/admin')
    record('Supabase password sign-in',s==200,{'http':s,'user':d.get('user') if isinstance(d,dict) else None},200)
    must(s,d,'Supabase sign-in')
    s,d,h=request('/api/admin',auth=False,headers={'oai-authenticated-user-id':'qa-other','oai-authenticated-user-email':'qa-other@example.test'})
    record('spoofed unsigned identity header ignored',s==401,{'http':s},401)
    for endpoint,limit in [('/api/admin',150000),('/api/candidate',30000)]:
        for raw in (b'{',b'null',b'[]'):
            s,d=rawrequest(endpoint,raw);record(endpoint+' malformed JSON/envelope '+raw.decode(),s==400,{'http':s},400)
        s,d=rawrequest(endpoint,json.dumps({'padding':'x'*(limit+1)}).encode(),chunked=True)
        record(endpoint+' oversized chunked body rejected',s==413,{'http':s},413)
    s,d,h=admin({'action':'save','assessment':assessment([objective()])})
    record('valid scratch ready assessment',s==200,{'http':s},200); testid=must(s,d,'valid create')['id']
    cases=[]
    def bad(name,mutate):
        a=assessment([objective()]);mutate(a);cases.append((name,a))
    bad('601-second total',lambda a:a.update(modules=[objective('one',seconds=300),objective('two',seconds=301)]))
    bad('empty ready assessment',lambda a:a.update(modules=[]))
    bad('14-second module',lambda a:a['modules'][0].update(seconds=14))
    bad('fractional seconds',lambda a:a['modules'][0].update(seconds=15.5))
    bad('duplicate module IDs',lambda a:a['modules'].append(copy.deepcopy(a['modules'][0])))
    bad('invalid module ID',lambda a:a['modules'][0].update(id='../bad'))
    bad('duplicate question IDs',lambda a:a['modules'][0]['questions'].append(copy.deepcopy(a['modules'][0]['questions'][0])))
    bad('invalid key index',lambda a:a['modules'][0]['questions'][0].update(correct=2))
    bad('string key index',lambda a:a['modules'][0]['questions'][0].update(correct='0'))
    bad('blank answer option',lambda a:a['modules'][0]['questions'][0].update(options=['A',' ']))
    bad('reserved module ID',lambda a:a['modules'][0].update(id='constructor'))
    bad('reserved question ID',lambda a:a['modules'][0]['questions'][0].update(id='constructor'))
    bad('typing with questions',lambda a:a['modules'][0].update(kind='typing',passage='a'*120,targetWpm=45))
    bad('numeric module ID',lambda a:a['modules'][0].update(id=1))
    bad('numeric question ID',lambda a:a['modules'][0]['questions'][0].update(id=1))
    bad('numeric/string ID collision',lambda a:a.update(modules=[objective(1),objective('1')]))
    bad('writing with questions',lambda a:a['modules'][0].update(kind='writing',prompt='Write a reply.'))
    bad('null module',lambda a:a.update(modules=[None]))
    bad('null question',lambda a:a['modules'][0].update(questions=[None]))
    for name,a in cases:
        s,d,h=admin({'action':'save','assessment':a});record('reject '+name,s==400,{'http':s,'error':d.get('error') if isinstance(d,dict) else str(d)},400)
    s,d,h=admin({'action':'save','assessment':assessment([],'draft')});record('empty scratch draft allowed',s==200,{'http':s},200)
    s,d,h=admin({'action':'save','assessment':assessment([objective('at-limit',seconds=600)])});record('600-second maximum allowed',s==200,{'http':s},200)
    s,d,h=admin({'action':'save','assessment':assessment([objective()]),'x':1})
    s,d,h=request('/api/admin',{'action':'save','assessment':assessment([objective()])},headers={'Origin':'https://untrusted.example'})
    record('foreign-origin recruiter mutation blocked',s==403,{'http':s},403)
    draftid=create(assessment([],'draft'));s,d,h=admin({'action':'link','id':draftid,'alias':'QA SYNTHETIC draft'})
    record('cannot link draft',s==400,{'http':s},400)
    noisy=assessment([objective('noisy','q-noisy')]);noisy['modules'][0]['answerKey']={'q-noisy':0};noisy['modules'][0]['questions'][0]['extraKey']='secret-synthetic-marker'
    noisyid=create(noisy);noisyattempt,noisytoken=link(noisyid,'sanitization');s,noise,h=getcand(noisytoken);s,noise,h=cand(noisytoken,'start',noise['revision']);must(s,noise,'noisy start')
    sanitized=findadmin(noisyattempt)['modules'][0]
    record('unvalidated extras stripped on persistence and candidate view','answerKey' not in sanitized and 'extraKey' not in sanitized['questions'][0] and 'secret-synthetic-marker' not in json.dumps(noise) and 'answerKey' not in noise['module'],{'stored_module_keys':list(sanitized),'candidate_module_keys':list(noise['module'])})
    attemptid,token=link(testid,'snapshot')
    s,snapshot,h=getcand(token);record('prestart candidate has no questions or answer key',s==200 and snapshot.get('module') is None and 'result' not in snapshot,{'http':s,'module':snapshot.get('module'),'keys':list(snapshot)},200)
    changed=assessment([objective(seconds=16)]);changed.update(id=testid,revision=1,title='QA SYNTHETIC edited '+runid);changed['modules'][0]['questions'][0]['correct']=1
    s,d,h=admin({'action':'save','assessment':changed});record('assessment revision update',s==200,{'http':s},200)
    s,d,h=admin({'action':'save','assessment':changed});record('stale assessment save rejected',s==409,{'http':s},409)
    frozen=findadmin(attemptid);record('immutable snapshot keeps title/timer/key',frozen['title'].startswith('QA SYNTHETIC '+runid) and frozen['modules'][0]['seconds']==15 and frozen['modules'][0]['questions'][0]['correct']==0,{'title':frozen['title'],'seconds':frozen['modules'][0]['seconds'],'correct':frozen['modules'][0]['questions'][0]['correct']})
    s,started,h=cand(token,'start',snapshot['revision']);must(s,started,'start')
    sanitized=started['module'];record('active candidate response hides conventional answer keys',all('correct' not in q and 'explanation' not in q for q in sanitized['questions']) and 'targetWpm' not in sanitized and 'result' not in started,{'module_keys':list(sanitized),'question_keys':list(sanitized['questions'][0])})
    s,d,h=cand(token,'start',snapshot['revision']);record('stale duplicate start rejected',s==409,{'http':s},409)
    s,d,h=cand(token,'save',started['revision'],{'choices':{'q-spell':5}});record('out of range candidate choice rejected',s==400,{'http':s},400)
    s,saved,h=cand(token,'save',started['revision'],{'choices':{'q-spell':0,'injected':1},'text':'ignored'});must(s,saved,'save')
    s,reloaded,h=getcand(token);record('autosave/reload resumes same authoritative clock',reloaded['answer']=={'choices':{'q-spell':0}} and reloaded['deadline']==started['deadline'] and reloaded['sectionDeadline']==started['sectionDeadline'],{'revision':reloaded['revision'],'answer':reloaded['answer'],'clock_unchanged':reloaded['deadline']==started['deadline']})
    s,d,h=cand(token,'save',started['revision'],{'choices':{'q-spell':1}});record('stale save rejected',s==409,{'http':s},409)
    with ThreadPoolExecutor(max_workers=2) as ex:
        responses=list(ex.map(lambda n:cand(token,'save',reloaded['revision'],{'choices':{'q-spell':n}}),[0,1]))
    record('concurrent save is single-writer',sorted(r[0] for r in responses)==[200,409],{'http':sorted(r[0] for r in responses)},[200,409])
    s,cur,h=getcand(token);s,cur,h=cand(token,'save',cur['revision'],{'choices':{'q-spell':0}});must(s,cur,'correct restore')
    s,done,h=cand(token,'advance',cur['revision'],{'choices':{'q-spell':0}});must(s,done,'submit')
    final=findadmin(attemptid);record('server score uses frozen original key',final['result']['objective']==100 and final['result']['modules'][0]['details'][0]['answer']=='A',{'objective':final['result']['objective'],'answer':final['result']['modules'][0]['details'][0]['answer']})
    before=copy.deepcopy(final)
    s,d,h=cand(token,'advance',cur['revision'],{'choices':{'q-spell':1}});after=findadmin(attemptid)
    record('repeated completed submit is immutable/idempotent',s==200 and after['answers']==before['answers'] and after['revision']==before['revision'] and 'result' not in d,{'http':s,'revision_unchanged':after['revision']==before['revision'],'candidate_keys':list(d)})
    # Three short sections use actual wall/server time; fixed typing must run the full configured sample.
    passage='Alpha beta gamma delta. '*8
    mods=[objective('first','q-first'),{'id':'type','kind':'typing','title':'QA typing','seconds':15,'instructions':'Copy for 15 seconds.','passage':passage,'targetWpm':45},{'id':'write','kind':'writing','title':'QA writing','seconds':15,'instructions':'Write.','prompt':'Write a helpful fictional reply.'}]
    timedtest=create(assessment(mods));timedid,timedtoken=link(timedtest,'timer')
    s,view,h=getcand(timedtoken);s,view,h=cand(timedtoken,'start',view['revision']);must(s,view,'timer start')
    s,view,h=cand(timedtoken,'advance',view['revision'],{'choices':{'q-first':0}});must(s,view,'objective advance')
    s,d,h=cand(timedtoken,'advance',view['revision'],{'text':'Alpha'});record('typing cannot advance early',s==400,{'http':s},400)
    typed=passage[:56];s,view,h=cand(timedtoken,'save',view['revision'],{'text':typed});must(s,view,'typing autosave')
    s,again,h=getcand(timedtoken);record('typing reload restores saved text and clock',again['answer']=={'text':typed} and again['sectionDeadline']==view['sectionDeadline'],{'answer_chars':len(again['answer']['text']),'clock_unchanged':again['sectionDeadline']==view['sectionDeadline']})
    wait=max(0,(view['sectionDeadline']-view['serverNow'])/1000)+0.2
    print(json.dumps({'waiting_actual_seconds':round(wait,2)}),flush=True);time.sleep(wait)
    s,view,h=cand(timedtoken,'advance',view['revision'],{'text':typed});must(s,view,'typing deadline advance')
    record('typing deadline advances to writing',view['currentIndex']==2 and view['module']['kind']=='writing',{'index':view['currentIndex'],'kind':view['module']['kind']})
    s,view,h=cand(timedtoken,'save',view['revision'],{'text':'I will check the fictional tracking and update you tomorrow.'});must(s,view,'writing autosave')
    s,view,h=cand(timedtoken,'advance',view['revision'],{'text':'I will check the fictional tracking and update you tomorrow.'});must(s,view,'writing submit')
    timed=findadmin(timedid)
    record('locked previous sections preserved',timed['answers']['first']=={'choices':{'q-first':0}} and timed['answers']['type']=={'text':typed},{'answers':timed['answers']})
    typeScore=next(m for m in timed['result']['modules'] if m['kind']=='typing')
    record('typing score uses full 15-second sample',typeScore['seconds']==15 and typeScore['netWpm']==round(len(typed)/5/.25,1) and typeScore['accuracy']==100,{'typing':typeScore})
    review={'ratings':{'accuracy':3,'empathy':3,'clarity':4,'ownership':3},'notes':'The fictional reply supplies a clear next-working-day update.','outcome':'reviewed'}
    for name,mutation in [('missing rating',lambda r:r['ratings'].pop('accuracy')),('rating five',lambda r:r['ratings'].update(accuracy=5)),('fractional rating',lambda r:r['ratings'].update(accuracy=2.5)),('short notes',lambda r:r.update(notes='bad')),('invalid outcome',lambda r:r.update(outcome='hired'))]:
        badreview=copy.deepcopy(review);mutation(badreview);s,d,h=admin({'action':'review','id':timedid,'revision':timed['revision'],'review':badreview});record('reject review '+name,s==400,{'http':s},400)
    with ThreadPoolExecutor(max_workers=2) as ex:
        responses=list(ex.map(lambda _:admin({'action':'review','id':timedid,'revision':timed['revision'],'review':review}),range(2)))
    record('concurrent human review is single-writer',sorted(r[0] for r in responses)==[200,409],{'http':sorted(r[0] for r in responses)},[200,409])
    reviewed=findadmin(timedid);record('human review persists separately from objective',reviewed['review']['ratings']==review['ratings'] and reviewed['result']==timed['result'],{'ratings':reviewed['review']['ratings'],'objective_unchanged':reviewed['result']==timed['result']})
    # Exact overall clock with consistent 2.5s buffered-answer grace and request finalization.
    inherited=create(assessment([objective('inherit','toString')]))
    inheritedid,inheritedtoken=link(inherited,'inherited-ID');s,view,h=getcand(inheritedtoken);s,view,h=cand(inheritedtoken,'start',view['revision']);must(s,view,'inherited-ID start')
    s,view,h=cand(inheritedtoken,'save',view['revision'],{'choices':{}})
    record('inherited question ID remains safely unanswered',s==200 and view.get('answer')=={'choices':{}},{'http':s,'answer':view.get('answer')},200)
    if s==200:
        s,view,h=cand(inheritedtoken,'advance',view['revision'],{'choices':{}});inheriteddone=findadmin(inheritedid);record('inherited unanswered choice scores zero',s==200 and (inheriteddone.get('result') or {}).get('objective')==0,{'http':s,'objective':(inheriteddone.get('result') or {}).get('objective')})
    expirytest=create(assessment([objective('expiry','q-expiry')]))
    graceid,gracetoken=link(expirytest,'grace');s,grace,h=getcand(gracetoken);s,grace,h=cand(gracetoken,'start',grace['revision']);s,grace,h=cand(gracetoken,'save',grace['revision'],{'choices':{'q-expiry':1}});must(s,grace,'grace saved')
    expiryid,expirytoken=link(expirytest,'expiry');s,expiry,h=getcand(expirytoken);s,expiry,h=cand(expirytoken,'start',expiry['revision']);s,expiry,h=cand(expirytoken,'save',expiry['revision'],{'choices':{'q-expiry':0}});must(s,expiry,'expiry saved')
    wait=max(0,(grace['deadline']-grace['serverNow'])/1000)+0.2
    print(json.dumps({'waiting_actual_seconds':round(wait,2)}),flush=True);time.sleep(wait)
    s,graceview,h=getcand(gracetoken)
    record('candidate GET preserves buffered-answer grace',s==200 and graceview.get('status')=='in-progress' and graceview.get('deadline')==grace['deadline'],{'http':s,'status':graceview.get('status'),'deadline_unchanged':graceview.get('deadline')==grace['deadline']})
    adminview=findadmin(graceid)
    record('admin GET preserves same buffered-answer grace',adminview['status']=='in-progress',{'status':adminview['status']},'in-progress')
    s,graceview,h=cand(gracetoken,'advance',graceview['revision'],{'choices':{'q-expiry':0}});must(s,graceview,'grace post')
    gracefinal=findadmin(graceid);graceresult=gracefinal.get('result') or {}
    record('buffered final POST accepted during grace without extending clock',graceview.get('status')=='completed' and graceresult.get('objective')==100 and graceresult.get('timedOut') is True and graceresult.get('completedAt')==gracefinal['deadline'],{'status':graceview.get('status'),'objective':graceresult.get('objective'),'timedOut':graceresult.get('timedOut'),'completedAt_equals_deadline':graceresult.get('completedAt')==gracefinal['deadline']})
    s,expiryview,h=getcand(expirytoken)
    wait=max(0,(expiry['deadline']+2500-expiryview['serverNow'])/1000)+0.3
    print(json.dumps({'waiting_actual_seconds':round(wait,2)}),flush=True);time.sleep(wait)
    expired=findadmin(expiryid);expiredresult=expired.get('result') or {}
    record('admin refresh finalizes abandoned overall timeout after grace',expired['status']=='completed' and expiredresult.get('timedOut') is True and expiredresult.get('objective')==100 and expiredresult.get('completedAt')==expired['deadline'],{'status':expired['status'],'timedOut':expiredresult.get('timedOut'),'objective':expiredresult.get('objective'),'completedAt_equals_deadline':expiredresult.get('completedAt')==expired['deadline']})
    s,expiryview,h=getcand(expirytoken);expiredagain=findadmin(expiryid)
    record('candidate reload sees final timeout idempotently',s==200 and expiryview.get('status')=='completed' and expiredagain['revision']==expired['revision'] and 'result' not in expiryview,{'http':s,'status':expiryview.get('status'),'revision_unchanged':expiredagain['revision']==expired['revision']})
    s,d,h=getcand('f'*63);record('invalid capability shape rejected',s==404,{'http':s},404)
    s,d,h=getcand('f'*64);record('unknown valid-shape capability rejected',s==404,{'http':s},404)
    s,d,h=request('/api/candidate',{'token':token,'action':'save','revision':1,'answer':{}},auth=False,headers={'Origin':'https://untrusted.example'});record('foreign-origin candidate mutation blocked',s==403,{'http':s},403)
    print(json.dumps({'summary':{k:sum(r['status']==k for r in results) for k in ('PASS','FAIL','NOT RUN')},'results_file':OUT}),flush=True)
except Exception as e:
    record('HARNESS BLOCKER',False,{'error':str(e)})
    raise

if any(r['status'] == 'FAIL' for r in results):
    raise SystemExit(1)
