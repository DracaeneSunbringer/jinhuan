import {getSDK} from '@discourse-mini-app/sdk'
import paths from 'valley-assets'
export const sdk=getSDK()
const urls=new Map(),jsons=new Map(),preferences=new Map(),objectURLs=new Set()
let user=null,ready=false
export const message=(text)=>{const e=document.getElementById('mini-status');if(e)e.textContent=text}
export async function initialize(){
 await sdk.ready
 if(!sdk.permissions.has('user.read')||!sdk.permissions.has('network.request'))throw Error('请允许读取账号和访问游戏服务后重新打开。')
 const forumUser=await sdk.user.getCurrent();if(!forumUser)throw Error('登录论坛后即可进入 🌟🐟谷。')
 if(sdk.permissions.has('storage.read'))try{const saved=JSON.parse(await sdk.localStorage.getItem('prefs:'+forumUser.id)||'{}');for(const [k,v]of Object.entries(saved))preferences.set(k,String(v))}catch{}
 preferences.set('isleSfx','0') // No synthesized audio without an approved WebAudio capability.
 const unique=[...new Set(Object.values(paths).map(p=>typeof p==='string'?p:p.path))].filter(p=>!p.endsWith('.txt')),loaded=new Map();let cursor=0
 await Promise.all(Array.from({length:6},async()=>{while(cursor<unique.length){const path=unique[cursor++];if(path.endsWith('.json'))loaded.set(path,await sdk.assets.readJson(path));else{const bytes=await sdk.assets.readBytes(path),type=/\.webp$/.test(path)?'image/webp':'image/png',url=URL.createObjectURL(new Blob([bytes],{type}));loaded.set(path,url);objectURLs.add(url)}}}))
 const sheets=new Map()
 for(const [site,path] of Object.entries(paths)){
  if(typeof path==='string'){if(path.endsWith('.json'))jsons.set(site,loaded.get(path));else if(!path.endsWith('.txt'))urls.set(site,loaded.get(path));continue}
  if(!sheets.has(path.path)){const img=new Image();await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=loaded.get(path.path)});sheets.set(path.path,img)}
  const c=document.createElement('canvas');c.width=path.w;c.height=path.h;c.getContext('2d').drawImage(sheets.get(path.path),path.x,path.y,path.w,path.h,0,0,path.w,path.h);urls.set(site,canvasURL(c))
 }
 user=await api('/session');ready=true
 return user
}
export function assetURL(path){const key=String(path).split('?')[0];if(urls.has(key))return urls.get(key);if(path.startsWith('blob:'))return path;throw Error('素材未在包内声明：'+key)}
export function canvasURL(canvas){const data=canvas.toDataURL('image/png').split(',')[1],bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));objectURLs.add(url);return url}
export function readJSON(path){const key=path.split('?')[0];if(!jsons.has(key))throw Error('未声明的数据：'+key);return structuredClone(jsons.get(key))}
export async function api(route,{method='GET',body}={}){
 const endpoint=method==='GET'?'gameRead':'gameWrite'
 if(method!=='GET'&&method!=='POST')throw Error('不支持的操作')
 const url=new URL(route,'https://mini.invalid'),args=method==='GET'?{query:{route:url.pathname,...Object.fromEntries([...url.searchParams].filter(([key])=>['q','limit','cursor'].includes(key)))}}:{json:{route:url.pathname,payload:body||{},...(url.searchParams.size?{query:Object.fromEntries([...url.searchParams].filter(([key])=>['xp','item'].includes(key)))}:{})}}
 const result=await sdk.http.request(endpoint,args)
 if(result.status<200||result.status>=300){const error=new Error(result.body?.error||'游戏服务暂时不可用');error.status=result.status;error.code=result.body?.code;error.data=result.body;throw error}
 return result.body
}
export async function miniFetch(input,init={}){
 const path=String(input).split('?')[0]
 if(path.startsWith('/api/')){
  try{const data=await api(String(input).slice(4),{method:init.method||'GET',body:init.body?JSON.parse(init.body):undefined});return {ok:true,status:200,json:async()=>data}}
  catch(error){return {ok:false,status:error.status||503,json:async()=>error.data||{error:error.message}}}
 }
 return jsons.has(path) ? {ok:true,status:200,json:async()=>readJSON(path)} : {ok:false,status:404,json:async()=>({})}
}
export const miniStorage={
 getItem:key=>preferences.get(key)??null,
 setItem(key,value){preferences.set(key,String(value));if(ready&&sdk.permissions.has('storage.write'))void sdk.localStorage.setItem('prefs:'+user.forum_id,JSON.stringify(Object.fromEntries(preferences))).catch(()=>message('偏好暂未保存，游戏进度仍由服务端保存。'))},
 removeItem:key=>preferences.delete(key),
}
export function dispose(){for(const u of objectURLs)URL.revokeObjectURL(u);objectURLs.clear()}
// 论坛沙箱 iframe 不允许原生 confirm/prompt/alert（静默返回取消），擂台的洗点、约战改用这里的页内弹窗。
// 用 showModal 的 <dialog>，才能叠在已经 showModal 的擂台弹窗上面。
function ask(text,{input=null,ok='确定'}={}){
 return new Promise(resolve=>{
  const d=document.createElement('dialog');d.className='mini-ask'
  const p=document.createElement('p');p.className='mini-ask-text';p.textContent=text
  const field=input==null?null:Object.assign(document.createElement('input'),{type:'text',inputMode:'numeric',value:input,className:'mini-ask-input'})
  const row=document.createElement('div');row.className='mini-ask-row'
  const no=Object.assign(document.createElement('button'),{type:'button',className:'pb-btn ghost',textContent:'取消'})
  const yes=Object.assign(document.createElement('button'),{type:'button',className:'pb-btn',textContent:ok})
  let done=false
  const finish=value=>{if(done)return;done=true;d.close();d.remove();resolve(value)}
  no.onclick=()=>finish(input==null?false:null)
  yes.onclick=()=>finish(input==null?true:field.value)
  d.addEventListener('cancel',e=>{e.preventDefault();finish(input==null?false:null)})
  field?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();yes.click()}})
  row.append(no,yes);d.append(p,...(field?[field]:[]),row);document.body.append(d);d.showModal();(field||yes).focus()
 })
}
export const miniConfirm=text=>ask(text)
export const miniPrompt=(text,value='')=>ask(text,{input:String(value)})
