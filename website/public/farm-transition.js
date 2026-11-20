const deadline=Date.parse('2026-10-28T12:00:00+08:00');
const emblem='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 15c0-6 5-11 9-11s9 5 9 11c0 4-4 5-9 5s-9-1-9-5Z"/><path d="M8 12v2m8-2v2m-6 2q2 2 4 0"/></svg>';
function update(){if(Date.now()<deadline)return;for(const a of document.querySelectorAll('a[data-nav="farm"]')){a.href='/arcade';a.removeAttribute('data-link');a.dataset.nav='arcade';a.setAttribute('title','游戏大厅');if(a.hasAttribute('aria-label')){a.setAttribute('aria-label','游戏大厅');a.innerHTML='<span aria-hidden="true">'+emblem+'</span>'}else a.textContent='游戏大厅'}}
update();if(Date.now()<deadline)setTimeout(update,Math.max(1,deadline-Date.now()+50));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
