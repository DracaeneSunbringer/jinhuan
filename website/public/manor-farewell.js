export async function showManorFarewell(host,{h,api,user,navigate}){
 const section=h('section',{class:'manor-farewell'},h('h1',null,'肥鱼庄园已下线'),h('p',null,'庄园剩余资产按结算时刻折算为D币，原有存档与账本保留。'));
 const body=h('div',{class:'manor-farewell-result'},h('p',{role:'status'},user?'正在读取补偿结果…':'登录后可查看自己的资产补偿。'));
 section.append(body,h('button',{class:'btn',onclick:()=>navigate('/')},'返回图廊'));host.replaceChildren(section);
 if(!user)return;
 const read=async()=>{body.replaceChildren(h('p',{role:'status'},'正在读取补偿结果…'));try{
  const d=await api('/manor/farewell');if(!section.isConnected)return;body.replaceChildren(h('p',null,d.message));
  if(d.amount!==null&&d.amount!==undefined)body.append(h('strong',{class:'manor-farewell-amount'},Number(d.amount).toLocaleString('zh-CN')+' D币'));
  if(d.closedAt)body.append(h('p',{class:'muted'},'结算时刻：'+new Date(d.closedAt*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）'));
  if(d.details?.lines?.length){const details=h('details',null,h('summary',null,'查看补偿明细')),list=h('ul');for(const row of d.details.lines)list.append(h('li',null,h('span',null,h('span',null,(row.label||row.reason)+' × '+row.quantity),h('small',{class:'muted',style:'display:block'},row.reason)),h('strong',null,Number(row.coins).toLocaleString('zh-CN')+' D币')));details.append(list);body.append(details)}
  if(d.status==='preparing'||d.status==='pending')body.append(h('button',{class:'btn btn-ghost',onclick:read},'刷新补偿结果'));
 }catch(e){if(section.isConnected)body.replaceChildren(h('p',{role:'alert'},e.message||'读取失败，请重试'),h('button',{class:'btn btn-ghost',onclick:read},'重试'))}};
 await read();
}
