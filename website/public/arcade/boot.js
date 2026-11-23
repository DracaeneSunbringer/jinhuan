import {startCloud} from './cloud.js'
const game=document.body.dataset.game
try{
 if(document.body.dataset.authority==='on'){const {startAuthority}=await import('./authority-ui.js?v=20261029-idle');window.arcadeCloud=await startAuthority(game)}
 else window.arcadeCloud=await startCloud(game)
 const start=async()=>{if(start.started||window.arcadeCloud.locked)return;start.started=true;await import('./'+game+'/ui.js');let ready=false;const fail=()=>{if(ready)return;const status=document.querySelector('.arcade-hostbar>span');if(status)status.textContent='游戏初始化失败，请刷新重试，云存档未更改';const gate=document.createElement('div');gate.className='arcade-gate';gate.setAttribute('role','alert');gate.textContent='游戏初始化失败，请刷新重试。';document.body.prepend(gate)};document.addEventListener('arcade-engine-ready',()=>{ready=true;document.body.classList.remove('arcade-loading')},{once:true});const script=document.createElement('script');script.src='/arcade/'+game+'/engine.js';script.onload=()=>setTimeout(fail,2000);script.onerror=fail;document.body.append(script)};
 document.addEventListener('arcade-authority-ready',()=>{void start()});await start()
}catch(error){
 const status=document.querySelector('.arcade-hostbar>span');if(status)status.textContent='游戏暂时无法打开：'+(error.message||'资源加载失败')
 if(!document.querySelector('dialog[open]')){const box=document.createElement('div');box.className='arcade-gate';box.setAttribute('role','alert');const text=document.createElement('p');text.textContent='游戏资源加载失败，进度不会被重置。';const retry=document.createElement('button');retry.textContent='重新加载';retry.onclick=()=>location.reload();box.append(text,retry);document.body.prepend(box)}
}
