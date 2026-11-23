// 单页20条摘要；只在用户展开某条时加载媒体，不自动播放视频或动图。
export function openChatFavorites(anchor,{h,icon,api,openPop,closePop,send,toast,view,onRemoval,blurAll=()=>false}){
 const doc=anchor.ownerDocument
 if(!doc.getElementById('chat-favorites-media-css')){const css=doc.createElement('link');css.id='chat-favorites-media-css';css.rel='stylesheet';css.href='/chat-favorites-media.css?v=472f7fbf';doc.head.append(css)}
 const list=h('div',{class:'cm-favorites-list'}),status=h('p',{class:'muted',role:'status'}),prev=h('button',{class:'btn',type:'button'},'上一页'),next=h('button',{class:'btn',type:'button'},'下一页')
 const root=h('section',{class:'cm-favorites','aria-label':'消息收藏'},h('header',null,h('strong',null,'消息收藏'),h('button',{type:'button',class:'cm-ibtn','aria-label':'关闭消息收藏',onclick:closePop},icon('close'))),list,status,h('footer',null,prev,next))
 openPop(anchor,root,{key:'chat-favorites',up:true})
 const maskers=new Set();let lastBlur=!!blurAll()
 const observer=new doc.defaultView.MutationObserver(()=>{const active=!!blurAll();if(active===lastBlur)return;lastBlur=active;for(const entry of maskers)entry(active)})
 observer.observe(doc.documentElement,{attributes:true,attributeFilter:['data-blur-all']});onRemoval(root,()=>{observer.disconnect();maskers.clear()})
 let cursor='',nextCursor=null,history=[],loading=false
 const labels={image:'图片',g:'动图',v:'视频',l:'实况',f:'文件'}
 function draw(item){
  const counts={};for(const k of item.attachments||[])counts[k]=(counts[k]||0)+1
  const summary=Object.entries(counts).map(([k,n])=>`${labels[k]||'附件'}×${n}`).join(' · ')
  const row=h('article',{class:'cm-favorite-row'}),text=h('div',{class:'cm-favorite-text'},h('p',null,item.expired?(item.body||'附件消息'):item.unavailable?'来源已撤回或不可查看':item.body||'附件消息'),h('small',null,item.expired?'附件已超过七天':summary))
  const thumbs=h('div',{class:'cm-favorite-media',hidden:true});let detail=null,expanded=false,fetching=false
  const preview=h('button',{class:'btn cm-favorite-preview',type:'button',disabled:!!item.unavailable,'aria-expanded':'false',onclick:async()=>{
   if(fetching)return
   if(expanded){expanded=false;thumbs.hidden=true;thumbs.replaceChildren();detail=null;preview.textContent='预览附件';preview.setAttribute('aria-expanded','false');return}
   fetching=true;preview.disabled=true;preview.textContent='加载中…'
   try{
    detail=await api(`/chat/favorites/${item.id}/media`);if(!root.isConnected)return
    expanded=true;thumbs.hidden=false;preview.textContent='收起附件';preview.setAttribute('aria-expanded','true')
    thumbs.replaceChildren(...detail.media.map((media,index)=>{
     if(media.k==='f')return h('span',{class:'cm-favorite-file'},media.n||'文件')
     let masked=!!media.b||!!blurAll()
     const image=media.k==='g'?h('span',{class:'cm-favorite-gif'},'GIF'):h('img',{src:media.u,alt:'',loading:'lazy',decoding:'async',onerror:e=>{e.currentTarget.hidden=true}})
     const open=async()=>{
      if(masked)return;button.disabled=true;zoom.disabled=true
      try{const fresh=await api(`/chat/favorites/${item.id}/media`);if(!root.isConnected||!button.isConnected||!detail||masked)return;if(fresh.version!==detail.version||!fresh.media[index])throw Error('来源消息已变化，请重新预览');view(fresh.media[index])}
      catch(e){if(root.isConnected)status.textContent=e.message}
      finally{button.disabled=false;zoom.disabled=masked}
     }
     const button=h('button',{class:'cm-favorite-thumb'+(masked?' is-blurred':''),type:'button','aria-label':masked?'已模糊，点击显示':media.v?'查看视频':'查看大图',onclick:()=>{
      if(!media.b&&!blurAll())return open();setMasked(!masked)
     }},image,media.v&&h('span',{class:'cm-favorite-play','aria-hidden':'true'},'▶'),h('span',{class:'cm-favorite-mask'},'已模糊'))
     const zoom=h('button',{class:'cm-favorite-zoom',type:'button',disabled:masked,'aria-label':media.v?'放大查看视频':'放大查看图片',onclick:open},icon('zoom','i tiny'))
     const setMasked=value=>{masked=value;button.classList.toggle('is-blurred',masked);button.setAttribute('aria-label',masked?'已模糊，点击显示':media.b||blurAll()?'已显示，点击恢复模糊':media.v?'查看视频':'查看大图');zoom.disabled=masked}
     const sync=active=>setMasked(active||!!media.b);maskers.add(sync);onRemoval(button,()=>maskers.delete(sync))
     return h('div',{class:'cm-favorite-media-cell'},button,zoom)
    }))
   }catch(e){if(root.isConnected){status.textContent=e.message;preview.textContent='重试预览'}}finally{fetching=false;if(root.isConnected)preview.disabled=!!item.unavailable}
  }},'预览附件')
  let job={id:item.id,nonce:crypto.randomUUID(),tries:0},busy=false
  const sendButton=h('button',{class:'btn',type:'button',disabled:!!item.unavailable,onclick:async()=>{
   if(busy)return;busy=true;sendButton.disabled=true;sendButton.textContent='发送中…'
   try{await send(job);if(!root.isConnected)return;toast('已发送','ok');job={id:item.id,nonce:crypto.randomUUID(),tries:0};sendButton.textContent='发送'}
   catch(e){if(root.isConnected){status.textContent=e.message;sendButton.textContent='重试'}}
   finally{busy=false;if(root.isConnected)sendButton.disabled=!!item.unavailable}
  }},'发送')
  const remove=h('button',{class:'cm-ibtn',type:'button',title:'移除收藏','aria-label':'移除收藏',onclick:async()=>{
   if(busy)return;remove.disabled=true
   try{await api(`/chat/favorites/${item.id}`,{method:'DELETE'});if(root.isConnected){row.remove();if(!list.children.length)await load()}}
   catch(e){if(root.isConnected)status.textContent=e.message}
   finally{remove.disabled=false}
  }},icon('trash'))
  row.append(text,item.attachments?.length&&!item.unavailable&&preview,sendButton,remove,thumbs);return row
 }
 async function load(){
  if(loading||!root.isConnected)return
  loading=true;prev.disabled=next.disabled=true;status.textContent='加载中…'
  try{const data=await api('/chat/favorites'+(cursor?'?before='+encodeURIComponent(cursor):''));if(!root.isConnected)return
   nextCursor=data.next;list.replaceChildren(...data.items.map(draw));status.textContent=data.items.length?'最多收藏100条；点击发送到当前群。':'暂无收藏。在消息菜单中选择「收藏消息」。'
  }catch(e){if(root.isConnected)status.replaceChildren(e.message+' ',h('button',{class:'btn-text',type:'button',onclick:load},'重试'))}
  finally{loading=false;if(root.isConnected){prev.disabled=!history.length;next.disabled=!nextCursor}}
 }
 prev.onclick=()=>{if(loading)return;cursor=history.pop()||'';load()}
 next.onclick=()=>{if(loading||!nextCursor)return;history.push(cursor);cursor=nextCursor;load()}
 load()
}
