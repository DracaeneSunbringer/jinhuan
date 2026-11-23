export function mountFullscreen(host,{sdk,notify=()=>{}}={}){
 const box=document.createElement('div');box.className='isle-screen-controls';box.setAttribute('aria-label','全屏控制')
 const enter=document.createElement('button'),exit=document.createElement('button');enter.type=exit.type='button';enter.textContent='⛶ 全屏';exit.textContent='退出全屏';exit.disabled=true
 box.append(enter,exit);host.querySelector('.isle')?.append(box)
 const supported=sdk?!!sdk.fullscreen&&sdk.permissions.has('fullscreen'):!!document.documentElement.requestFullscreen
 if(!supported){enter.disabled=true;enter.title='当前平台未提供全屏能力'}
 let busy=false
 const sync=active=>{exit.disabled=!active;enter.setAttribute('aria-pressed',String(active))}
 const change=()=>{if(!sdk)sync(!!document.fullscreenElement)}
 document.addEventListener('fullscreenchange',change)
 if(sdk&&supported)exit.disabled=false;else change()
 const run=async on=>{if(busy)return;busy=true;enter.disabled=true;try{if(sdk){const r=await sdk.fullscreen[on?'request':'exit']();sync(r.active)}else{if(on)await document.documentElement.requestFullscreen();else if(document.fullscreenElement)await document.exitFullscreen();change()} }catch(e){notify(on?'当前平台未允许进入全屏，请稍后重试':'退出全屏未完成，请使用 Esc 或平台退出按钮')}finally{busy=false;enter.disabled=!supported}}
 enter.onclick=()=>run(true);exit.onclick=()=>run(false)
 return ()=>{document.removeEventListener('fullscreenchange',change);box.remove()}
}
