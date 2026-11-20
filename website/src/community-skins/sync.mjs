import {checkManifest,inspectImage} from './format.mjs'
import {compileCommunityCss} from './css.mjs'
const catalogKey='community-skins/catalog.json',pendingKey='community-skins/pending.json'
const bytes=async(response,limit)=>{if(!response.ok)throw Error('素材仓库暂不可用');const declared=Number(response.headers.get('content-length')||0);if(declared>limit)throw Error('素材超出大小限制');const reader=response.body?.getReader();if(!reader)throw Error('响应为空');const parts=[];let n=0;try{while(true){const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>limit){await reader.cancel();throw Error('素材超出大小限制')}parts.push(value)}}finally{reader.releaseLock()}const out=new Uint8Array(n);let at=0;for(const part of parts){out.set(part,at);at+=part.length}return out}
const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('')
async function jsonObject(bucket,key){const obj=await bucket.get(key);if(!obj)return null;try{return {obj,data:JSON.parse(await obj.text())}}catch{throw Error('已保存目录无法读取')}}
export async function syncCommunitySkins(bucket,repository,fetcher=fetch){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw Error('请配置素材仓库');
 const root='https://raw.githubusercontent.com/'+repository+'/'
 const response=await fetcher(root+'main/catalog.json',{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(10000)}),raw=await bytes(response,512*1024);let catalog;try{catalog=JSON.parse(new TextDecoder().decode(raw))}catch{throw Error('投稿目录格式无效')}
 if(catalog?.schemaVersion!==1||!Number.isSafeInteger(catalog.revision)||catalog.revision<1||!/^[a-f0-9]{40}$/.test(catalog.source||'')||!Array.isArray(catalog.entries)||catalog.entries.length>200)throw Error('投稿目录无效')
 const existing=await jsonObject(bucket,catalogKey);if(existing?.data?.revision>catalog.revision||(existing?.data?.revision===catalog.revision&&existing.data.source!==catalog.source))throw Error('拒绝旧版投稿目录');if(existing?.data?.revision===catalog.revision&&existing.data.source===catalog.source)return {unchanged:true}
 const staged=await jsonObject(bucket,pendingKey),done=new Set(staged?.data?.source===catalog.source?staged.data.done||[]:[]),known=new Map((existing?.data?.entries||[]).flatMap(x=>Object.values(x.components||{}).map(a=>[a.sha256,a]))),seen=new Set(),out=[];let uploaded=0,incomplete=false
 for(const item of catalog.entries){
  if(!item||seen.has(item.id))throw Error('套装编号重复');seen.add(item.id)
  const minimal={schemaVersion:item.schemaVersion,id:item.id,name:item.name,author:item.author,github:item.github,license:item.license,permission:item.permission,components:{}}
  for(const [kind,v] of Object.entries(item.components||{}))minimal.components[kind]={file:v.file,...(v.slice?{slice:v.slice}:{}),...(v.style?{style:v.style.file}:{})}
  const clean=checkManifest(minimal,item.id),components={}
  const syncCss=async(kind,meta,path)=>{
   if(meta?.file!==path||meta.type!=='text/css'||!/^[a-f0-9]{64}$/.test(meta.sha256||'')||!Number.isSafeInteger(meta.bytes)||meta.bytes<1||meta.bytes>32768)throw Error('样式摘要无效')
   const key=`css:${clean.id}:${kind}:${meta.sha256}`
   const previous=[...(existing?.data?.entries||[]),...(existing?.data?.archived||[])].find(x=>x.id===clean.id)?.components?.[kind]
   if(previous?.sha256!==meta.sha256&&previous?.style?.sha256!==meta.sha256&&!done.has(key)){
    if(uploaded>=8){incomplete=true;return null}
    const data=await bytes(await fetcher(`${root}${catalog.source}/submissions/${clean.id}/${path}`,{signal:AbortSignal.timeout(10000)}),32768)
    if(data.length!==meta.bytes||await digest(data)!==meta.sha256)throw Error('样式内容与目录不一致')
    const css=compileCommunityCss(new TextDecoder('utf-8',{fatal:true}).decode(data),clean.id,kind)
    await bucket.put(`community-skins/css/${clean.id}/${kind}/${meta.sha256}`,css,{httpMetadata:{contentType:'text/css; charset=utf-8',cacheControl:'public, max-age=31536000, immutable'}});done.add(key);uploaded++
   }
   return {sha256:meta.sha256,type:'text/css'}
  }
  for(const [kind,spec] of Object.entries(clean.components)){
   const meta=item.components[kind];if(spec.file.endsWith('.css')){const css=await syncCss(kind,meta,spec.file);if(css)components[kind]=css;continue}
   const expectedType={'png':'image/png','jpg':'image/jpeg','webp':'image/webp'}[spec.file.split('.').at(-1)];if(!/^[a-f0-9]{64}$/.test(meta.sha256||'')||!Number.isSafeInteger(meta.bytes)||meta.bytes<20||meta.bytes>4*1024*1024||meta.type!==expectedType||!Number.isInteger(meta.width)||!Number.isInteger(meta.height)||meta.width<1||meta.height<1||meta.width>2048||meta.height>2048||meta.width*meta.height>4194304)throw Error('素材摘要无效')
   if(spec.slice&&(spec.slice[0]+spec.slice[2]>=meta.height||spec.slice[1]+spec.slice[3]>=meta.width))throw Error('边框切片超出图片')
   const previous=known.get(meta.sha256);if(previous&&(previous.type!==meta.type||previous.width!==meta.width||previous.height!==meta.height))throw Error('素材元信息不一致')
   if(!known.has(meta.sha256)&&!done.has(meta.sha256)){
    if(uploaded>=8){incomplete=true;continue}
    const image=await bytes(await fetcher(`${root}${catalog.source}/submissions/${clean.id}/${spec.file}`,{signal:AbortSignal.timeout(10000)}),4*1024*1024),info=inspectImage(image,spec.file.split('.').at(-1))
    if(await digest(image)!==meta.sha256||image.length!==meta.bytes||info.width!==meta.width||info.height!==meta.height||info.type!==meta.type)throw Error('素材内容与目录不一致')
    if(spec.slice&&(spec.slice[0]+spec.slice[2]>=info.height||spec.slice[1]+spec.slice[3]>=info.width))throw Error('边框切片超出图片')
    await bucket.put('community-skins/images/'+meta.sha256,image,{httpMetadata:{contentType:info.type,cacheControl:'public, max-age=31536000, immutable'}});done.add(meta.sha256);uploaded++
   }
   const style=spec.style?await syncCss(kind,meta.style,spec.style):null
   components[kind]={sha256:meta.sha256,type:meta.type,width:meta.width,height:meta.height,...(spec.slice?{slice:spec.slice}:{}),...(style?{style}:{})}
  }
  out.push({id:clean.id,name:clean.name,author:clean.author,github:clean.github,license:clean.license,components})
 }
 if(incomplete){await bucket.put(pendingKey,JSON.stringify({source:catalog.source,done:[...done]}));return {pending:true,uploaded}}
 // Retain the last published bubble artwork if a contributor later removes it;
 // only current entries enter the draw pool, but existing owners can still wear it.
 const activeBubble=new Set(out.filter(x=>x.components?.bubble).map(x=>x.id)),archived=new Map()
 for(const item of [...(existing?.data?.archived||[]),...(existing?.data?.entries||[])])if(item?.components?.bubble&&!activeBubble.has(item.id))archived.set(item.id,{id:item.id,name:item.name,author:item.author,github:item.github,license:item.license,components:{bubble:item.components.bubble}})
 const value=JSON.stringify({schemaVersion:1,revision:catalog.revision,source:catalog.source,entries:out,archived:[...archived.values()]}),onlyIf=existing?{etagMatches:existing.obj.etag}:new Headers({'if-none-match':'*'})
 const written=await bucket.put(catalogKey,value,{onlyIf,httpMetadata:{contentType:'application/json',cacheControl:'public, max-age=60'}});if(!written)return {conflict:true}
 return {published:true,source:catalog.source,entries:out.length}
}
export async function readCommunityCatalog(bucket){const found=await jsonObject(bucket,catalogKey);return found?.data||{schemaVersion:1,source:'',entries:[]}}
export async function readCommunityImage(bucket,hash){if(!/^[a-f0-9]{64}$/.test(hash))return null;return bucket.get('community-skins/images/'+hash)}
export async function readCommunityCss(bucket,id,kind,hash){if(!/^[a-z0-9][a-z0-9-]{2,47}$/.test(id)||!['bubble','title','badge','reply'].includes(kind)||!/^[a-f0-9]{64}$/.test(hash))return null;return bucket.get(`community-skins/css/${id}/${kind}/${hash}`)}
