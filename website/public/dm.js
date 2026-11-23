;(() => {
if (window.siteConfirm) return
const css = '.site-ask{max-width:min(380px,calc(100vw - 32px));width:380px;border:1px solid var(--line,#d9dfd5);border-radius:16px;padding:20px 18px 16px;background:var(--surface,#fff);color:var(--text,#172d25);box-shadow:0 24px 64px rgba(0,0,0,.22);font:inherit;font-family:var(--font,system-ui,sans-serif)}'
  + '.site-ask::backdrop{background:rgba(10,20,16,.42)}.site-ask p{margin:0 0 14px;font-size:14px;line-height:1.65;white-space:pre-line;word-break:break-word}'
  + '.site-ask input{display:block;width:100%;box-sizing:border-box;margin:0 0 14px;padding:9px 11px;border:1px solid var(--line,#d9dfd5);border-radius:10px;background:var(--surface-2,#f3f4f0);color:inherit;font:inherit;font-size:14px}'
  + '.site-ask .site-ask-acts{display:flex;justify-content:flex-end;gap:8px}.site-ask button{min-width:72px;padding:8px 14px;border-radius:10px;border:1px solid var(--line,#d9dfd5);background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:600;cursor:pointer}'
  + '.site-ask button.site-ask-ok{border-color:transparent;background:var(--primary,#1f6b4f);color:var(--primary-ink,#fff)}.site-ask button:focus-visible{outline:2px solid var(--primary,#1f6b4f);outline-offset:2px}'
let styled = false
function ask(text, mode, value) {
  return new Promise((resolve) => {
    if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = css; document.head.append(s) }
    const d = document.createElement('dialog'); d.className = 'site-ask'; d.setAttribute('aria-label', '确认')
    const p = document.createElement('p'); p.textContent = String(text ?? '')
    const input = mode === 'prompt' ? Object.assign(document.createElement('input'), { type: 'text', value: value == null ? '' : String(value) }) : null
    const acts = document.createElement('div'); acts.className = 'site-ask-acts'
    const ok = Object.assign(document.createElement('button'), { type: 'button', className: 'site-ask-ok', textContent: mode === 'alert' ? '知道了' : '确定' })
    const no = mode === 'alert' ? null : Object.assign(document.createElement('button'), { type: 'button', textContent: '取消' })
    let done = false
    const prev = document.activeElement
    const end = (v) => { if (done) return; done = true; try { d.close() } catch {} d.remove(); try { prev && prev.focus && prev.focus() } catch {} resolve(v) }
    const cancel = () => end(mode === 'confirm' ? false : mode === 'prompt' ? null : undefined)
    ok.onclick = () => end(mode === 'confirm' ? true : mode === 'prompt' ? input.value : undefined)
    if (no) no.onclick = cancel
    d.addEventListener('cancel', (e) => { e.preventDefault(); cancel() })
    d.addEventListener('click', (e) => { if (e.target !== d) return; const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cancel() })
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok.click() } })
    if (no) acts.append(no); acts.append(ok)
    d.append(p); if (input) d.append(input); d.append(acts)
    document.body.append(d)
    try { d.showModal() } catch { d.setAttribute('open', '') }
    ;(input || ok).focus(); if (input) input.select()
  })
}
window.siteConfirm = (text) => ask(text, 'confirm')
window.sitePrompt = (text, value) => ask(text, 'prompt', value)
window.siteAlert = (text) => { void ask(text, 'alert') }
})();
import {refreshMessageReference} from '/message-reference.js?v=472f7fbf'
// 一对一私信：仅在页面可见时轮询，离开页面即释放定时器和请求。
export function renderDmPage(root,{path,me,navigate,onLeave,sidebarHost,onRead,compose,renderText,renderMedia}) {
  const state={threadId:Number(path.match(/^\/dm\/(\d+)$/)?.[1]||0),peer:null,draft:null,newest:0,oldest:0,loading:false,closed:false,since:0,reply:null,edit:null,sending:false}
  const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
  const button=(label,cls,fn)=>{const e=node('button',cls,label);e.type='button';e.addEventListener('click',fn);return e}
  const api=async(path,options={})=>{
    const response=await fetch('/api'+path,{credentials:'same-origin',cache:'no-store',...options,headers:{'content-type':'application/json',...(options.headers||{})}})
    const data=await response.json().catch(()=>({}))
    if(!response.ok)throw new Error(data.error||'请求失败')
    return data
  }
  const post=(path,body,method='POST')=>api(path,{method,body:JSON.stringify(body)})
  const report=(error)=>{notice.textContent=error?.message||String(error);notice.hidden=false}
  const shell=node('section','dm-page'),top=node('header','dm-top'),layout=node('div','dm-layout')
  const back=node('a','dm-back','← 群聊');back.href='/chat';back.dataset.link=''
  const title=node('h1','','私信'),notice=node('p','dm-notice');notice.hidden=true
  top.append(back,title)
  const side=node('aside','dm-side'),search=node('input','dm-search'),results=node('div','dm-search-results'),threads=node('div','dm-threads')
  search.type='search';search.placeholder='找人发私信';search.autocomplete='off';search.setAttribute('aria-label','搜索私信对象')
  side.append(node('h2','','会话'),search,results,threads)
  const pane=node('section','dm-pane'),head=node('header','dm-pane-head'),feed=node('div','dm-feed'),older=button('查看更早的消息','dm-older',loadOlder)
  const composer=compose?.(),form=composer?.form||node('form','dm-compose'),input=composer?.input||node('textarea','dm-input'),send=composer?.send||button('发送','dm-send',()=>form.requestSubmit())
  const context=node('div','dm-compose-context');context.hidden=true
  function setContext(message,edit=false,focus=true){if(edit&&composer?.hasMedia()){report(Error('请先发送或移除待发附件，再编辑消息'));return}state.reply=edit?null:message;state.edit=edit?message:null;composer?.setEditing(edit&&!!message);context.hidden=!message;context.replaceChildren();if(message){context.append(node('span','',(edit?'编辑文字：':'回复：')+(message.body||'[附件]')),button('取消','btn-text',()=>{setContext(null);if(edit)input.value=''}));if(edit)input.value=message.body;if(focus)input.focus()}}
  if(!composer){input.placeholder='发一条私信';input.maxLength=2000;input.rows=2;input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit()}});form.append(input,send)}
  form.prepend(context);pane.append(head,older,feed,form)
  const enable=value=>{if(composer)composer.setEnabled(value);else input.disabled=!value;send.disabled=!value}
  if(sidebarHost){shell.classList.add('dm-embedded');sidebarHost.replaceChildren(side);layout.append(pane);shell.append(notice,layout)}
  else{layout.append(side,pane);shell.append(top,notice,layout)}
  root.replaceChildren(shell)
  const fit=()=>{if(sidebarHost||!shell.isConnected)return;const vh=visualViewport?.height||innerHeight
    const bottom=innerWidth<=760?(document.querySelector('.mobile-nav')?.getBoundingClientRect().height||0):0
    shell.style.height=Math.max(260,vh-shell.getBoundingClientRect().top-bottom-8)+'px'}
  visualViewport?.addEventListener('resize',fit);addEventListener('resize',fit);requestAnimationFrame(fit)
  let searchTimer=0,searchAbort=null,threadTimer=0,listTimer=0,nonce=null,nonceBody='',nonceBodyKey=''
  function cleanup(){state.closed=true;composer?.destroy();clearTimeout(searchTimer);clearInterval(threadTimer);clearInterval(listTimer);searchAbort?.abort();document.removeEventListener('visibilitychange',onVisible);visualViewport?.removeEventListener('resize',fit);removeEventListener('resize',fit)}
  onLeave(cleanup)
  if(!me){side.replaceChildren(node('p','dm-empty','登录后可以与其他成员私信'));pane.replaceChildren();return cleanup}
  function label(peer){return peer?.name||peer?.username||'成员'}
  const dayKey=t=>new Date((t+8*3600)*1000).toISOString().slice(0,10)
  function refreshDates(){let previous='';for(const row of feed.children){const day=row.dataset.day,old=row.querySelector(':scope > .dm-date');if(day!==previous){if(!old)row.prepend(node('div','dm-date',day.replaceAll('-',' / ')))}else old?.remove();previous=day}}
  const rowMessages=new WeakMap()
  const quoteText=r=>(r.sender_id===me.id?'我':label(state.peer))+'：'+r.body
  function messageRow(m){const row=node('article','dm-message'+(m.sender_id===me.id?' mine':''));rowMessages.set(row,m);row.dataset.id=m.id;row.dataset.day=dayKey(m.created_at);row.dataset.version=JSON.stringify(m)
    const bubble=node('div','dm-bubble'),time=node('small','dm-time',new Date(m.created_at*1000).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'}))
    time.title=new Date(m.created_at*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})
    if(m.reply_to)bubble.append(button(quoteText(m.reply_to),'dm-quote',()=>feed.querySelector(`[data-id="${m.reply_to.id}"]`)?.scrollIntoView({block:'center'})))
    if(renderText&&!m.deleted)bubble.append(...[renderText(m.body||'')].flat(Infinity).filter(x=>x!=null));else bubble.append(m.body)
    if(m.media?.length&&renderMedia)bubble.append(renderMedia(m.media))
    row.append(bubble,time)
    if(!m.deleted){const tools=node('div','dm-message-tools');tools.append(button('回复','btn-text',()=>setContext(m)))
      if(m.sender_id===me.id){tools.append(button('编辑','btn-text',()=>setContext(m,true)),button('撤回','btn-text',async()=>{if(!await window.siteConfirm('撤回这条私信？'))return;try{await post('/dm/messages/'+m.id,{},'DELETE');updateMessage({...m,deleted:true,body:'消息已撤回',media:[],reply_to:null});loadThreads();onRead?.()}catch(error){report(error)}}))}
      row.append(tools)}return row}
  function updateMessage(m){
    const old=feed.querySelector(`[data-id="${m.id}"]`)
    if(old&&old.dataset.version!==JSON.stringify(m)){old.replaceWith(messageRow(m));refreshDates()}
    for(const row of feed.children){
      const previous=rowMessages.get(row);if(!previous)continue
      const next=refreshMessageReference(previous,m,'dm');if(next===previous)continue
      rowMessages.set(row,next);row.dataset.version=JSON.stringify(next)
      const quote=row.querySelector('.dm-quote');if(quote)quote.textContent=quoteText(next.reply_to)
    }
    if(state.reply?.id===m.id&&m.thread_id===state.threadId)setContext(m.deleted?null:m,false,false)
  }
  function showPeer(peer){state.peer=peer;notice.hidden=true;enable(true);head.replaceChildren(button('←','dm-pane-back',()=>{state.draft=null;navigate('/dm')}),node('strong','',label(peer)))
    shell.classList.add('thread-open')}
  function clearPeer(){state.peer=null;state.draft=null;state.threadId=0;state.newest=0;state.oldest=0;state.since=0;shell.classList.remove('thread-open');head.replaceChildren(node('strong','','选一个会话，或搜索成员'));feed.replaceChildren();older.hidden=true;enable(false)}
  function appendMessages(items,prepend=false){if(!items.length)return
    const atBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<90,oldHeight=feed.scrollHeight
    const frag=document.createDocumentFragment();items.forEach(m=>frag.append(messageRow(m)))
    if(prepend)feed.prepend(frag);else feed.append(frag)
    while(feed.children.length>200){if(prepend)feed.lastChild.remove();else feed.firstChild.remove()}
    refreshDates()
    if(prepend)feed.scrollTop+=feed.scrollHeight-oldHeight;else if(atBottom)feed.scrollTop=feed.scrollHeight
  }
  async function openThread(id){state.draft=null;state.threadId=id;state.newest=0;state.oldest=0;feed.replaceChildren();older.hidden=true
    try{const data=await api(`/dm/threads/${id}/messages`);if(state.closed||state.threadId!==id)return
      showPeer(data.thread.peer);appendMessages(data.messages);state.oldest=data.messages[0]?.id||0;state.newest=data.messages.at(-1)?.id||0;older.hidden=!data.has_more
      state.since=data.server_now||0;feed.scrollTop=feed.scrollHeight;await markRead();loadThreads()}catch(error){report(error);clearPeer()}}
  async function markRead(){if(!state.threadId||document.visibilityState!=='visible')return
    try{await post(`/dm/threads/${state.threadId}/read`,{through:state.newest},'PUT');if(!state.closed)onRead?.()}catch{} }
  async function loadOlder(){if(!state.threadId||!state.oldest||state.loading)return
    state.loading=true;older.disabled=true
    try{const id=state.threadId,data=await api(`/dm/threads/${id}/messages?before=${state.oldest}`);if(state.closed||state.threadId!==id)return
      appendMessages(data.messages,true);state.oldest=data.messages[0]?.id||state.oldest;older.hidden=!data.has_more}
    catch(error){report(error)}finally{state.loading=false;older.disabled=false}}
  async function pollThread(){if(state.closed||!state.threadId||document.visibilityState!=='visible')return
    try{const id=state.threadId,data=await api(`/dm/threads/${id}/messages?after=${state.newest}&since=${state.since}`);if(state.closed||state.threadId!==id)return
      for(const m of data.updates||[])updateMessage(m);state.since=data.server_now||state.since
      const fresh=data.messages.filter(m=>m.id>state.newest&&!feed.querySelector(`[data-id="${m.id}"]`));appendMessages(fresh);state.newest=Math.max(state.newest,data.messages.at(-1)?.id||0)
      if(fresh.length){await markRead();loadThreads()}}
    catch(error){report(error)}}
  async function loadThreads(){if(state.closed||document.visibilityState!=='visible')return
    try{const data=await api('/dm/threads');if(state.closed)return
      threads.replaceChildren(...(data.threads.length?data.threads.map(t=>{
        const row=button('', 'dm-thread'+(t.id===state.threadId?' on':''),()=>navigate('/dm/'+t.id))
        row.append(node('strong','',t.peer_name||t.peer_username),node('span','dm-thread-last',t.last_body||'开始聊天'))
        if(t.unread)row.append(node('i','dm-unread',t.unread>99?'99+':String(t.unread)))
        return row}):[node('p','dm-empty','还没有私信，搜索一个成员开始聊天')]))}
    catch(error){report(error)}}
  search.addEventListener('input',()=>{clearTimeout(searchTimer);searchAbort?.abort();const q=search.value.trim();if(!q){results.replaceChildren();return}
    searchTimer=setTimeout(async()=>{searchAbort=new AbortController();try{const data=await api('/dm/users?q='+encodeURIComponent(q),{signal:searchAbort.signal});if(state.closed||search.value.trim()!==q)return
      results.replaceChildren(...data.users.map(u=>button(label(u)+' · @'+u.username,'dm-user',()=>{if(sidebarHost){navigate('/dm/new/'+u.id);return}state.draft=u;state.threadId=0;feed.replaceChildren();showPeer(u);older.hidden=true;results.replaceChildren();search.value='';input.focus()})))}catch(error){if(error.name!=='AbortError')report(error)}},220)})
  input.addEventListener('input',()=>{if(input.value.trim()!==nonceBody)nonce=null})
  form.addEventListener('submit',async e=>{e.preventDefault();const body=input.value.trim();if(state.sending||(!body&&!composer?.hasMedia())||(!state.threadId&&!state.draft))return
    if([...body].length>2000){report(Error('私信文字不能超过2000字'));return}
    state.sending=true;enable(false);nonceBody=body
    try{const media=state.edit?[]:await composer?.media()||[],payload=JSON.stringify([body,media,state.reply?.id||0]);if(nonceBodyKey!==payload){nonce=null;nonceBodyKey=payload}const key=nonce||(nonce=crypto.randomUUID().replaceAll('-',''))
      if(state.edit){const result=await post('/dm/messages/'+state.edit.id,{body},'PATCH');if(state.closed)return;updateMessage(result.message);input.value='';setContext(null);loadThreads();return}
      const data=await post(state.threadId?`/dm/threads/${state.threadId}/messages`:`/dm/users/${state.draft.id}/messages`,{body,media,reply_to:state.reply?.id||0,nonce:key});if(state.closed)return
      composer?.clear();input.value='';nonce=null;setContext(null);notice.hidden=true;if(!state.threadId){navigate('/dm/'+data.thread_id);return}
      if(!feed.querySelector(`[data-id="${data.message.id}"]`))appendMessages([data.message]);state.newest=Math.max(state.newest,data.message.id);await markRead();loadThreads()}
    catch(error){report(error)}finally{state.sending=false;if(!state.closed)enable(!!state.peer)}})
  function onVisible(){if(document.visibilityState==='visible'){loadThreads();pollThread()}}
  document.addEventListener('visibilitychange',onVisible)
  const initialThread=state.threadId,draftId=Number(path.match(/^\/dm\/new\/(-?\d+)$/)?.[1]||0)
  clearPeer();loadThreads();if(initialThread)openThread(initialThread)
  else if(draftId)api('/dm/users/'+draftId).then(data=>{if(!state.closed){state.draft=data.user;showPeer(data.user);input.focus()}}).catch(report)
  threadTimer=setInterval(pollThread,5000);listTimer=setInterval(loadThreads,15000)
  return cleanup
}
