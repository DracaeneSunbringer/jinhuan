// 大肥鱼修仙记 · 存档同步：本地先按同一套规则执行（手感即时），每 2.2 秒把攒下的点击合成一批发给 /api/pet/world/act。
// 服务端用同一份 rules.js 复核；不一致时以服务端为准整体覆盖。每批最多 30 个动作（服务端上限）。
import {newXs,act as xsAct} from './rules.js?v=20b20a0e';
const GAP=2200,MAX=30,cap=s=>s[0].toUpperCase()+s.slice(1);
export async function serverStore({onSync,onError}={}){
 let rev=0,skew=0,queue=[],timer=0,busy=false,last=0,dead=false,coins=0;
 const now=()=>Math.floor(Date.now()/1000+skew);
 const accept=j=>{if(j.state){rev=j.rev;replace(j.state.xs)}if(j.coins!=null)coins=j.coins;if(j.now)skew=j.now-Date.now()/1000};
 const store={state:null,now,get coins(){return coins},get pending(){return queue.length+(busy?1:0)},
  async act(a){const r=xsAct(store.state,a,now());if(r.ok){queue.push({a:'xs'+cap(a.a),...(a.i!=null?{i:a.i}:{}),...(a.herb?{herb:a.herb}:{}),...(a.n!=null?{n:a.n}:{}),...(a.el?{el:a.el}:{})});schedule()}return r},
  flush,destroy(){dead=true;clearTimeout(timer);return flush()}};
 function replace(xs){const fresh=xs?.v?xs:newXs(now());if(!store.state){store.state=structuredClone(fresh);return}for(const k of Object.keys(store.state))delete store.state[k];Object.assign(store.state,structuredClone(fresh))}
 const r=await fetch('/api/pet/world',{credentials:'same-origin',signal:AbortSignal.timeout(20000)}),j=await r.json();if(!r.ok)throw Error(j.error||'存档加载失败');accept(j);
 function schedule(){if(timer||busy)return;timer=setTimeout(()=>{timer=0;flush()},Math.max(0,GAP-(Date.now()-last)))}
 let idle=null;
 async function flush(){if(busy){await idle;return flush()}if(!queue.length)return;busy=true;let done;idle=new Promise(r=>done=r);const batch=queue.splice(0,MAX),operation=crypto.randomUUID();
  try{for(let tries=0;;tries++){let res,body;
    try{res=await fetch('/api/pet/world/act',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({rev,operation,actions:batch}),signal:AbortSignal.timeout(15000)});body=await res.json()}
    catch(e){if(tries<3){await sleep(800*(tries+1));continue}throw Error('网络不稳，稍后核对结果')}
    if(res.status===429){await sleep(((body.retry||1)*1000)+200);continue}
    if(res.ok){last=Date.now();const bad=(body.out||[]).filter(o=>!o.ok);accept(body);if(bad.length)onSync?.(bad[0].msg||'已按服务器存档同步');break}
    if(body.code==='world_conflict'){accept(body);queue.length=0;onSync?.('存档在别处变动过，已同步');break}
    throw Error(body.error||'保存失败')}}
  catch(e){queue.length=0;onError?.(e);try{const r2=await fetch('/api/pet/world',{credentials:'same-origin'});if(r2.ok)accept(await r2.json())}catch{}}
  finally{busy=false;done();last=Date.now();if(queue.length&&!dead)schedule()}}
 return store;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
