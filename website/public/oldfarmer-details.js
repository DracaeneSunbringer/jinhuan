// Small cargo travels around the outside edge: farmer -> carrots -> warehouse
// -> coins -> farmer. Transform-only motion shares the chat visibility lifecycle.
export function appendFarmerDetail(el){
 if(el.querySelector(':scope > .rt-detail'))return
 const doc=el.ownerDocument,detail=doc.createElement('span');detail.className='rt-detail rt-detail-harvest';detail.setAttribute('aria-hidden','true')
 for(const name of ['frame','belt','warehouse','farmer','appeal']){
  const node=doc.createElement('i');node.className='rt-harvest-'+name
  if(name==='belt')for(const [cargo,count] of [['carrot',5],['coin',2]])for(let n=0;n<count;n++){const flow=doc.createElement('b');flow.className='rt-harvest-'+cargo;flow.style.setProperty('--cargo-delay',(-n*9/count)+'s');node.append(flow)}
  if(name==='appeal'){const text=doc.createElement('b');text.textContent='胡萝卜滞销，帮帮我们';node.append(text);node.style.setProperty('--appeal-duration',(24+Math.floor(Math.random()*14))+'s');node.style.setProperty('--appeal-delay',(-Math.floor(Math.random()*24))+'s')}
  detail.append(node)
 }
 el.append(detail)
}
