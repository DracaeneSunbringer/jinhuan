// 大肥鱼修仙记 · 站内入口：从小岛菜单进入（替换旧 b16「云梦仙途」的 mountXian 接口，pets.js 只需改 import 路径）。
import {mountXs} from './game.js?v=20b20a0e';import {serverStore} from './net.js?v=20b20a0e';
export async function mountXian(host,{toast,onReturn}={}){
 if(!document.querySelector('link[data-xs]')){const l=document.createElement('link');l.rel='stylesheet';l.href=new URL('./xs.css?v=20b20a0e',import.meta.url).href;l.dataset.xs='';document.head.append(l)}
 const store=await serverStore({onSync:m=>toast?.(m),onError:e=>toast?.(e.message||'保存失败','err')});
 const wrap=document.createElement('div');wrap.className='xs-host';host.append(wrap);
 const st=store.state.st||0,start=st<1?'ferry':st<2?'sect':'garden',base=new URL('./',import.meta.url).href;
 let game;try{game=await mountXs(wrap,{art:base+'art/',maps:base+'maps/',store,onReturn,start})}catch(e){wrap.remove();await store.destroy();throw e}
 return {async destroy(){await game.destroy();wrap.remove()}};
}
