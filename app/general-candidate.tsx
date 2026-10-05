'use client';
import {useEffect,useState,useRef,useCallback} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {formatTime} from '@/lib/assessment';
export default function GeneralCandidate({token}:{token:string}) {
    const [test,setTest]=useState<{title:string;description:string;seconds:number}|null>(null);
    const [name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const attemptToken=useRef('');
    const submitting=useRef(false);
    const load=useCallback(async()=>{
        try {const r=await fetch(`/api/general-link?token=${encodeURIComponent(token)}`),d=await r.json();if(!r.ok)throw new Error(d.error);setTest(d);setError('');}
        catch(e){setError((e as Error).message);}
    },[token]);
    useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
    async function register(event:React.FormEvent){
        event.preventDefault();if(submitting.current)return;
        submitting.current=true;setBusy(true);setError('');
        try {
            if(!attemptToken.current){
                const key=`general-attempt:${token}`;
                let saved='';try{saved=sessionStorage.getItem(key)||'';}catch{}
                attemptToken.current=/^[a-f0-9]{64}$/.test(saved)?saved:Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
                try{sessionStorage.setItem(key,attemptToken.current);}catch{}
            }
            const r=await fetch('/api/general-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,name,attemptToken:attemptToken.current})}),d=await r.json();
            if(!r.ok)throw new Error(d.error);
            try{sessionStorage.removeItem(`general-attempt:${token}`);}catch{}
            window.location.replace(d.path);
        }catch(e){setError((e as Error).message);submitting.current=false;setBusy(false);}
    }
    return <div className="candidate-app"><header className="candidate-header"><div className="brand"><span className="brand-symbol">r</span><strong>resolvable</strong></div></header><main className="candidate-main">
        {test?<><div className="candidate-welcome"><h1>{test.title}</h1>{test.description&&<p>{test.description}</p>}<p>{formatTime(test.seconds)} maximum</p></div><section className="welcome-instructions general-registration"><form onSubmit={register}><label className="field"><span>Your name</span><Input aria-label="Your name" autoComplete="name" value={name} onChange={event=>setName(event.target.value)} maxLength={80} required disabled={busy}/></label>{error&&<p className="inline-error" role="alert">{error}</p>}<Button type="submit" disabled={busy||!name.trim()}>{busy?'Opening…':'Continue'}</Button></form></section></>:error?<section className="candidate-error"><h1>We couldn’t open this assessment</h1><p role="alert">{error}</p><Button onClick={()=>void load()}>Retry</Button></section>:<p role="status">Loading assessment…</p>}
    </main></div>;
}
