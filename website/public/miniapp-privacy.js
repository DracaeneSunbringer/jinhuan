export function createMiniappPrivacySettings({h,api,toast}){
 const input=h('input',{type:'checkbox',disabled:true,'aria-label':'在小程序中匿名'}),status=h('p',{class:'muted',role:'status','aria-live':'polite'},'正在读取设置…');let saved=false,busy=false,loaded=false;
 const save=h('button',{type:'button',class:'btn btn-primary sm',disabled:true,onclick:async()=>{if(busy||!loaded)return;busy=true;sync();status.textContent='正在保存…';try{const r=await api('/me/miniapp',{method:'PATCH',body:{anonymous:input.checked}});saved=r.anonymous;input.checked=saved;status.textContent='设置已保存，新读取的小程序内容会应用此设置。';toast?.('小程序隐私设置已保存','ok')}catch(e){status.textContent=e.message||'保存失败，请重试'}finally{busy=false;sync()}}},'保存设置');
 const retry=h('button',{type:'button',class:'btn btn-ghost sm',hidden:true,onclick:()=>load()},'重新读取');
 const sync=()=>{input.disabled=busy||!loaded;save.disabled=busy||!loaded||input.checked===saved};input.onchange=sync;
 const load=async()=>{busy=true;sync();retry.hidden=true;status.textContent='正在读取设置…';try{const r=await api('/me/miniapp');saved=r.anonymous===true;input.checked=saved;loaded=true;status.textContent=''}catch(e){status.textContent=e.message||'读取失败，请重试';retry.hidden=false}finally{busy=false;sync()}};
 const box=h('div',{},h('h3',{},'小程序隐私'),h('label',{class:'set-check'},input,'在小程序中匿名'),h('p',{class:'muted'},'开启后，小程序里的发布者、评论者和回应者统一显示为“匿名用户”，点赞明细也会隐藏身份。网站内的原始身份和内容保持不变。'),h('div',{class:'set-save'},save,retry),status);void load();return box
}
