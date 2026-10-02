"""Real local API checks for the shared-timer work sample. Never targets hosting."""
import copy, http.cookiejar, json, time, urllib.error, urllib.request
BASE = 'http://127.0.0.1:5173'
owner = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
guest = urllib.request.build_opener(urllib.request.ProxyHandler({}))
checks = 0
def request(client, path, body=None):
    req = urllib.request.Request(BASE+path, data=None if body is None else json.dumps(body).encode(), headers={'Content-Type':'application/json','Origin':BASE})
    try:
        with client.open(req, timeout=30) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())
def good(path, body=None, client=owner):
    status, data = request(client,path,body)
    assert status == 200, (status, data)
    return data
def check(name, condition):
    global checks
    assert condition, name
    checks += 1; print('PASS:',name,flush=True)
def admin(body): return good('/api/admin',body)
def workspace():return good('/api/admin')
def candidate(token, body=None): return good('/api/candidate?token='+token,client=guest) if body is None else good('/api/candidate',dict(body,token=token),guest)
def command(token,state,action,answer=None,**kwargs): return candidate(token,{'action':action,'revision':state['revision'],'answer':answer or {},**kwargs})

good('/auth/login',{'email':'recruiter@qa.invalid','password':'Local-QA-Only-57!Password'})
assessment = json.load(open('content/customer-service-core-v1.json'))
assessment['title']='WORKFLOW SYNTHETIC Shared-timer core'
assessment['config']['workSeconds']=120
check('approved content has B/A/B/C keys and 590-second planned journey', [q['correct'] for m in assessment['modules'] for q in m.get('questions',[])]==[1,0,1,2] and sum(m['seconds'] for m in assessment['modules'])+60+20==590)
for m in assessment['modules']:
    m['title']='WORKFLOW SYNTHETIC '+m['title'];admin({'action':'save-module','module':m})
aid=admin({'action':'save','assessment':assessment})['id']
assignment=admin({'action':'link','id':aid,'alias':'WORKFLOW SYNTHETIC Shared-timer candidate'})
token=assignment['path'].split('/')[-1]
view=candidate(token)
check('work timer starts deliberately',view['status']=='not-started' and view['deadline'] is None)
view=command(token,view,'start')
check('shared server deadline and confidential payload',view['deadline']-view['startedAt']==120000 and all('correct' not in q and 'explanation' not in q for m in view['modules'] for q in m.get('questions',[])) and all('rubric' not in m and 'example' not in m for m in view['modules']))
first=assessment['modules'][0];answer={'choices':{q['id']:q['correct'] for q in first['questions']}}
view=command(token,view,'navigate',answer,index=3)
writing=assessment['modules'][3]
reply='I can offer Monday after your confirmation or cancellation with the full refund. I will follow up at 16:00.'
view=command(token,view,'navigate',{'text':reply},index=0)
check('non-typing answers can be revisited and survive reload',candidate(token)['answer']==answer and candidate(token)['allAnswers'][writing['id']]['text']==reply)
deadline=view['deadline']
view=command(token,view,'navigate',answer,index=1)
check('typing has not started merely by entering section',not view['answer'].get('typing'))
view=command(token,view,'typing-start')
check('typing has separate server-defined 60-second window',view['answer']['typing']['deadline']-view['answer']['typing']['startedAt']==60000 and view['deadline']==deadline)
check('typing cannot be restarted',request(guest,'/api/candidate',{'token':token,'action':'typing-start','revision':view['revision']})[0]==400)
check('active typing cannot be skipped or finished with partial text',all(request(guest,'/api/candidate',{'token':token,'action':action,'revision':view['revision'],'answer':{'text':'partial'},'index':2})[0]==400 for action in ['navigate','typing-finish']))
typed=assessment['modules'][1]['passage']
view=command(token,view,'typing-finish',{'text':typed})
check('exact early completion records ceiling and elapsed time',view['answer']['typing']['complete'] and view['answer']['typing']['ceiling'] and 0<view['answer']['typing']['seconds']<60)
check('completed typing text is locked',request(guest,'/api/candidate',{'token':token,'action':'save','revision':view['revision'],'answer':{'text':'replacement'}})[0]==400)
view=command(token,view,'navigate',{'text':typed},index=2)
policy=assessment['modules'][2]
view=command(token,view,'navigate',{'choices':{q['id']:q['correct'] for q in policy['questions']}},index=3)
view=command(token,view,'submit',{'text':reply})
record=next(a for a in workspace()['attempts'] if a['id']==assignment['id'])
check('results show four decisions and separate typing, with no automatic writing rating',record['result']['objectiveCorrect']==4 and record['result']['objectiveTotal']==4 and record['result']['decisions'] and record['review'] is None and next(m for m in record['result']['modules'] if m['kind']=='typing')['score'] is None)
view=command(token,view,'submit',{'text':'duplicate replacement'})
check('duplicate submit is immutable and completion contains no key or score',view['status']=='completed' and view['module'] is None and 'result' not in view and 'modules' not in view and next(a for a in workspace()['attempts'] if a['id']==assignment['id'])['answers']==record['answers'])
ratings={writing['id']+':'+r['id']:3 for r in writing['rubric']};evidence={k:'Quote: follow up at 16:00; other choices are explained.' for k in ratings}
review={'ratings':ratings,'evidence':evidence,'notes':'Observed policy choices and explicit follow-up.','outcome':'reviewed'}
check('review requires evidence per custom criterion',request(owner,'/api/admin',{'action':'review','id':record['id'],'revision':record['revision'],'review':dict(review,evidence={})})[0]==400)
for n in range(2):
    current=next(a for a in workspace()['attempts'] if a['id']==record['id']);admin({'action':'review','id':record['id'],'revision':current['revision'],'review':dict(review,notes=review['notes']+' '+str(n))})
current=next(a for a in workspace()['attempts'] if a['id']==record['id'])
check('five human dimensions and earlier review remain separately recorded',len(current['review']['ratings'])==5 and len(current['review']['history'])==1 and current['review']['history'][0]['notes'].endswith('0') and current['review']['reviewer']=='recruiter@qa.invalid')
original=current['modules']
updated=next(a for a in workspace()['assessments'] if a['id']==aid);updated['modules'][0]['questions'][0]['correct']=0;updated['config']['workSeconds']=15;admin({'action':'save','assessment':updated})
check('edits do not alter already assigned content or scoring keys',next(a for a in workspace()['attempts'] if a['id']==record['id'])['modules']==original)
extra=admin({'action':'link','id':aid,'alias':'WORKFLOW SYNTHETIC Adjusted candidate','extraSeconds':120});ev=candidate(extra['path'].split('/')[-1]);check('agreed extra time is frozen in assignment',ev['seconds']==135)
short=admin({'action':'link','id':aid,'alias':'WORKFLOW SYNTHETIC Expiry candidate'});st=short['path'].split('/')[-1];sv=command(st,candidate(st),'start');sv=command(st,sv,'save',answer)
check('typing cannot start without a full measured window',request(guest,'/api/candidate',{'token':st,'action':'navigate','index':1,'revision':sv['revision'],'answer':answer})[0]==200)
sv=candidate(st);check('insufficient typing time is explained',request(guest,'/api/candidate',{'token':st,'action':'typing-start','revision':sv['revision']})[0]==400)
blank = copy.deepcopy(assessment); blank.pop('config'); blank['id']=''; blank['revision']=0; blank['modules']=[copy.deepcopy(assessment['modules'][1])]; blank['modules'][0].pop('targetWpm'); blank['title']='WORKFLOW SYNTHETIC Blank assessment with measured typing'
blank_id=admin({'action':'save','assessment':blank})['id']; blank_saved=next(a for a in workspace()['assessments'] if a['id']==blank_id)
check('a reusable measured module automatically enables editable administration without a target cutoff',blank_saved['config']['flexible'] and blank_saved['config']['workSeconds']==90)
ba=admin({'action':'link','id':blank_id,'alias':'WORKFLOW SYNTHETIC Blank typing candidate'});bt=ba['path'].split('/')[-1];bv=command(bt,candidate(bt),'start');bv=command(bt,bv,'typing-start')
check('blank assessment uses the same deliberate fixed 60-second measurement',bv['answer']['typing']['deadline']-bv['answer']['typing']['startedAt']==60000)
bv=command(bt,bv,'typing-finish',{'text':typed});bv=command(bt,bv,'submit',{'text':typed});br=next(a for a in workspace()['attempts'] if a['id']==ba['id']);bs=br['result']['modules'][0]
check('blank assessment saves automatic accuracy and speed from confirmed server duration',bs['accuracy']==100 and bs['errors']==0 and bs['seconds']==br['answers'][blank['modules'][0]['id']]['typing']['seconds'] and bs['score'] is None)
legacy=copy.deepcopy(assessment);legacy['id']='';legacy['revision']=0;legacy['title']='WORKFLOW SYNTHETIC Shared timer with legacy typing';legacy['modules']=[copy.deepcopy(assessment['modules'][1])];legacy['modules'][0].pop('typingMode');legacy['modules'][0].pop('code');legacy['modules'][0]['seconds']=15;legacy['config']['workSeconds']=120
lid=admin({'action':'save','assessment':legacy})['id'];la=admin({'action':'link','id':lid,'alias':'WORKFLOW SYNTHETIC Shared legacy typing candidate'});lt=la['path'].split('/')[-1];lv=command(lt,candidate(lt),'start');lv=command(lt,lv,'typing-start')
check('shared timer supports an editable legacy typing module duration',lv['answer']['typing']['deadline']-lv['answer']['typing']['startedAt']==15000)
check('legacy full-window measurement rejects early exact completion',request(guest,'/api/candidate',{'token':lt,'action':'typing-finish','revision':lv['revision'],'answer':{'text':typed}})[0]==400)
lv=command(lt,lv,'save',{'text':typed[:80]})
time.sleep(18)
lv=command(lt,candidate(lt),'typing-finish',{'text':typed[:80]});lv=command(lt,lv,'submit',{'text':typed[:80]});lr=next(a for a in workspace()['attempts'] if a['id']==la['id']);ls=lr['result']['modules'][0]
check('shared legacy typing is scored using its confirmed duration and saved text',ls['seconds']==15 and ls['accuracy']==100 and ls['netWpm']==64 and lr['answers'][legacy['modules'][0]['id']]['text']==typed[:80])
expired=candidate(st);er=next(a for a in workspace()['attempts'] if a['id']==short['id'])
check('expiry preserves confirmed saved work and missing evidence',expired['status']=='completed' and er['result']['timedOut'] and er['answers'][first['id']]==answer and next(m for m in er['result']['modules'] if m['kind']=='typing')['administration']=='Not attempted')
print(f'{checks} core workflow checks passed',flush=True)
