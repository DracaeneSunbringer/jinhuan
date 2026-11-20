import {onRemoval} from '/resource-memory.js'
export const OWNER52_ID='owner-52di'
export const OWNER52_TITLE={name:'52帝',mood:'站长专属',rarity:'SSR',ownerOnly:true}
export const OWNER52B_ID='owner-52b'
export const OWNER52B_TITLE={name:'52B',mood:'限定巡展',rarity:'SSR',ownerOnly:true}
const base='/assets/owner52-v031/',baseB='/assets/owner52-v032/',DARK_BADGES=[1,2,3],bindings=new WeakMap(),controllers=new WeakMap(),random=n=>crypto.getRandomValues(new Uint32Array(1))[0]%n
const node=(doc,tag,cls)=>{const e=doc.createElement(tag);e.className=cls;e.setAttribute('aria-hidden','true');return e}
export function owner52Badge(doc=document,{id=OWNER52_ID}={}){const e=node(doc,'span','di52-badge');e.dataset.badge=String(DARK_BADGES[random(DARK_BADGES.length)]);e.removeAttribute('aria-hidden');e.setAttribute('role','img');e.setAttribute('aria-label',(id===OWNER52B_ID?'52B':'52帝')+'徽章');e.title=(id===OWNER52B_ID?'52B · 限定黑色徽章':'52帝 · 站长专属黑色徽章');return e}
export function owner52Identity(doc=document,{title=true,badge=true,id=OWNER52_ID}={}){if(!title&&!badge)return null;const e=doc.createElement('span');e.className='di52-identity';if(title){const t=doc.createElement('span');t.className='di52-title';t.setAttribute('role','img');t.setAttribute('aria-label',id===OWNER52B_ID?'52B':'52帝');const img=node(doc,'img','di52-title-art');img.src=(id===OWNER52B_ID?baseB+'title-tiger-integrated-v1.webp':base+'title-dragon-integrated-v1.webp');img.alt='';t.append(img);e.append(t)}if(badge)e.append(owner52Badge(doc,{id}));return e}
function controller(doc){
 if(controllers.has(doc))return controllers.get(doc)
 const win=doc.defaultView,states=new Set(),visible=new Set(),life=new AbortController();let rig=null,loading=null,loadEpoch=0,raf=0,last=0,clock=0,closed=false
 const allowed=()=>!doc.hidden&&doc.documentElement.dataset.pageHidden!=='true'&&doc.documentElement.dataset.bubbleMotion!=='pause'&&!reduced.matches
 const live=s=>s.el.isConnected&&s.el.ownerDocument===doc&&s.el.classList.contains('di52-frame')&&(s.el.closest('.cm-row')?s.el.closest('.cm-row').dataset.bubbleLive==='true':visible.has(s.el))
 const setLive=()=>{for(const s of states)s.el.toggleAttribute('data-di52-live',allowed()&&live(s))}
 const draw=(items,seconds)=>{if(!rig||!items.length)return;const ids=new Set(items.flatMap(s=>[s.id,s.pixelId]));rig.render(seconds,ids);for(const s of items){rig.paint(s.full,s.id,false);rig.paint(s.pixel,s.pixelId,true);s.el.dataset.di52Ready='true'}}
 const tick=now=>{raf=0;if(closed||!allowed()){last=0;return}const items=[...states].filter(s=>s.full&&live(s));if(!items.length){last=0;return}if(!last||now-last>=1000/30){clock+=last?Math.min((now-last)/1000,.08):0;last=now;draw(items,clock)}if(rig?.animated)raf=win.requestAnimationFrame(tick)}
 const refresh=()=>{if(closed)return;setLive();const hasVisible=[...states].some(s=>s.full&&live(s));if(hasVisible)ensureRig();if(!allowed()||!hasVisible){win.cancelAnimationFrame(raf);raf=0;last=0;return}if(rig&&!raf)raf=win.requestAnimationFrame(tick)}
 const ensureRig=()=>{if(loading)return;const epoch=loadEpoch;loading=import('/owner52-rig.js').then(m=>m.createCharacterRig(doc,{signal:life.signal})).then(value=>{if(closed||epoch!==loadEpoch){value.destroy();return}rig=value;draw([...states].filter(s=>s.full),clock);refresh()}).catch(error=>{if(error.name!=='AbortError'&&!closed&&epoch===loadEpoch)for(const s of states)s.el.dataset.di52Ready='unavailable'})}
 const io=new win.IntersectionObserver(entries=>{for(const e of entries)e.isIntersecting?visible.add(e.target):visible.delete(e.target);refresh()},{threshold:0})
 const ro=new win.ResizeObserver(entries=>{for(const {target:e} of entries){const w=e.clientWidth,h=e.clientHeight,r=Math.max(0,Math.min(11,h/2-1)),svg=e.querySelector(':scope>.di52-track');if(!svg)continue;e.style.setProperty('--di52-diameter',Math.ceil(Math.hypot(w,h)*1.12)+'px');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.firstChild.setAttribute('d',`M${r+1} 1H${w-r-1}Q${w-1} 1 ${w-1} ${r+1}V${h-r-1}Q${w-1} ${h-1} ${w-r-1} ${h-1}H${r+1}Q1 ${h-1} 1 ${h-r-1}V${r+1}Q1 1 ${r+1} 1Z`)}})
 const prefs=new win.MutationObserver(refresh);prefs.observe(doc.documentElement,{attributes:true,attributeFilter:['data-bubble-motion','data-page-hidden']})
 doc.addEventListener('bubblevisibilitychange',refresh);doc.addEventListener('visibilitychange',refresh);win.addEventListener('pagehide',refresh)
 const reduced=win.matchMedia('(prefers-reduced-motion: reduce)');reduced.addEventListener('change',refresh)
 const api={add(s){states.add(s);if(!s.el.closest('.cm-row'))io.observe(s.el);ro.observe(s.el);if(s.full&&rig)draw([s],clock);refresh()},remove(s){states.delete(s);visible.delete(s.el);io.unobserve(s.el);ro.unobserve(s.el);delete s.el.dataset.di52Live;delete s.el.dataset.di52Ready;if(![...states].some(x=>x.full)){loadEpoch++;rig?.destroy();rig=null;loading=null}if(!states.size)api.destroy();else refresh()},destroy(){if(closed)return;closed=true;life.abort();win.cancelAnimationFrame(raf);io.disconnect();ro.disconnect();prefs.disconnect();doc.removeEventListener('bubblevisibilitychange',refresh);doc.removeEventListener('visibilitychange',refresh);win.removeEventListener('pagehide',refresh);reduced.removeEventListener('change',refresh);rig?.destroy();rig=null;states.clear();visible.clear();controllers.delete(doc)}}
 controllers.set(doc,api);return api
}
export function attachOwner52(el){
 const old=bindings.get(el);if(!el.classList.contains('di52-frame')){old?.cleanup();return}if(old)return
 const doc=el.ownerDocument,s={el,id:random(6),pixelId:random(6),nodes:[],full:null,pixel:null,control:null,closed:false};el.dataset.di52Skin=String(s.id);const palette=random(6);if(palette)el.dataset.color=['','green','yellow','blue','purple','black'][palette]
 const atmosphere=node(doc,'span','di52-atmosphere');for(const cls of ['di52-sheen','di52-spark','di52-spark','di52-spark','di52-insignia','di52-flare','di52-glint'])atmosphere.append(node(doc,'i',cls))
 const rim=node(doc,'span','di52-rim');rim.append(node(doc,'i','di52-rim-spin'));const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','di52-track');svg.setAttribute('aria-hidden','true');const path=doc.createElementNS(svg.namespaceURI,'path');path.setAttribute('pathLength','100');svg.append(path);s.nodes.push(atmosphere,rim,svg)
 if(el.classList.contains('cm-text')){for(const pixel of [false,true]){const wrap=node(doc,'span',pixel?'di52-pixel':'di52-character');wrap.dataset.corner=random(2)?'top':'bottom';const canvas=doc.createElement('canvas');canvas.width=pixel?40:114;canvas.height=pixel?44:120;wrap.append(canvas);s.nodes.push(wrap);if(pixel)s.pixel=canvas;else s.full=canvas}}
 s.cleanup=()=>{if(s.closed)return;s.closed=true;s.control?.remove(s);for(const n of s.nodes)n.remove();if(bindings.get(el)===s)bindings.delete(el);el.style.removeProperty('--di52-diameter')}
 bindings.set(el,s);el.append(...s.nodes)
 // Native chat can adopt a just-created message into a separate window first.
 queueMicrotask(()=>{if(s.closed)return;if(!el.isConnected){s.cleanup();return}s.control=controller(el.ownerDocument);s.control.add(s);onRemoval(el,s.cleanup)})
}
