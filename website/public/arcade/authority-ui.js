import {createAuthorityClient} from './authority-cloud.js'

// Enabled only in the isolated integration page until both games and their
// release migrations have passed end-to-end verification.
export async function startAuthority(game){
 const bar=document.createElement('nav'),back=document.createElement('a'),status=document.createElement('span'),retry=document.createElement('button')
 bar.className='arcade-hostbar';bar.setAttribute('aria-label','游戏与云存档');back.href='/arcade';back.textContent='‹ 游戏大厅';status.setAttribute('role','status');status.textContent='正在读取云端进度…';retry.type='button';retry.textContent='重新同步';bar.append(back,status,retry);document.body.prepend(bar)
 let timer=0,closed=false,block=()=>{}
 const client=await createAuthorityClient({game,onStatus:text=>{status.textContent=text},onState:detail=>document.dispatchEvent(new CustomEvent('arcade-authority-state',{detail}))})
 const recovered=()=>{if(!client.blocked)document.dispatchEvent(new Event('arcade-authority-ready'))}
 const active=()=>{const snapshot=client.state;if(!snapshot)return false;if(game==='mole')return !snapshot.paused;const s=snapshot.state;return !!(s&&(s.inBattle||s.autoSweepActive||snapshot.jobs?.length)&&!(s.event&&!s.autoEvents))}
 const sync=async()=>{if(closed||document.hidden)return;try{if(client.blocked){await client.recover();recovered()}else if(active())await client.dispatch('tick',{});else await client.reload()}catch(error){if(error.status!==429)status.textContent=error.message||'同步暂时不可用'}finally{schedule()}}
 function schedule(){clearTimeout(timer);if(!closed&&!document.hidden)timer=setTimeout(sync,active()?15000:60000)}
 retry.onclick=async()=>{try{if(client.blocked){await client.recover();recovered()}else await client.reload()}catch(error){status.textContent=error.message||'同步暂时不可用'}finally{schedule()}}
 const visible=()=>{if(document.hidden)clearTimeout(timer);else{void sync()}}
 const online=()=>{if(client.blocked)void client.recover().then(recovered).catch(error=>{status.textContent=error.message})}
 document.addEventListener('visibilitychange',visible);window.addEventListener('online',online)
 window.addEventListener('pagehide',()=>{closed=true;clearTimeout(timer);block();document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',online)},{once:true})
 schedule();return {authoritative:true,key:`jinhuan.arcade.authority.${game}.${client.userId}`,uid:client.userId,name:client.name,get locked(){return client.blocked},getState:()=>client.state,async dispatch(action,args){try{return await client.dispatch(action,args)}finally{schedule()}},flush:()=>client.reload(),commit(){},setCapture(){},setBlocker(fn){block=fn}}
}
