const button=document.querySelector('#export-save'),status=document.querySelector('#save-status');
button.onclick=async()=>{
 button.disabled=true;status.textContent='正在读取历史存档…';
 try{const r=await fetch('/api/slime/state',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)}),d=await r.json();if(!r.ok)throw Error(d.error||'暂时无法读取存档');if(!d.state){status.textContent='当前账号没有历史云存档。';return}
 const url=URL.createObjectURL(new Blob([JSON.stringify(d.state)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='史莱姆历史存档-'+d.user_id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='已下载历史云存档。'
 }catch(e){status.textContent=e.message||'读取失败，请重试'}finally{button.disabled=false}
};
