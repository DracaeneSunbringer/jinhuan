// 两处列表读取同一份小岛JSON，客户端只保留当前按钮状态。
export function whaleMark({id,name,marked,request,onChange,onError,className=''}){
 const b=document.createElement('button');b.type='button';b.className='whale-mark '+className;b.dataset.whaleId=id;b.textContent='🐳';
 const paint=()=>{b.setAttribute('aria-pressed',String(!!marked));b.setAttribute('aria-label',(marked?'取消标记 ':'标记 ')+name);b.title=marked?'取消佬友标记':'标记为佬友';b.style.opacity=marked?'1':'.45'};paint();
 b.onclick=async()=>{if(b.disabled)return;const check={busy:false};window.dispatchEvent(new CustomEvent('pet-friend-check',{detail:check}));if(check.busy){onError?.('小岛操作尚未结束，请稍候标记。');return}b.disabled=true;try{const d=await request(id,!marked);marked=d.marked;paint();window.dispatchEvent(new CustomEvent('pet-friend-saved',{detail:d}));onChange?.(marked)}catch(e){onError?.(e.message||'标记失败，请重试')}finally{b.disabled=false}};return b;
}
