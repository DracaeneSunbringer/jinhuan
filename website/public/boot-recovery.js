// The shell must remain usable if a module or the first account request fails.
(() => {
  const main=document.getElementById('main');if(!main)return;
  let timer;
  const recover=()=>{
    if(!main.querySelector('[data-boot-pending]'))return;
    const box=document.createElement('div'),message=document.createElement('p'),retry=document.createElement('button');
    box.className='empty';message.textContent='页面加载未完成，当前地址和账号数据已保留。';retry.className='btn btn-primary';retry.type='button';retry.textContent='重新加载';retry.onclick=()=>location.reload();box.append(message,retry);main.replaceChildren(box);
  };
  const error=e=>{if(e.target?.tagName==='SCRIPT'||e.filename?.includes('/app.js'))recover()};
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('error',error,true)};
  window.addEventListener('error',error,true);window.addEventListener('appready',cleanup,{once:true});timer=setTimeout(recover,20000);
})();
