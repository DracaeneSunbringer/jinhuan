import {sdk,initialize,api,message,dispose} from './platform.js'
import {mountIsle} from '/pet-isle.js'
import * as UI from '/pet-isle-ui.js'
import './style.css'
const root=document.getElementById('mini-world')
const GAME_NAME=__MINI_NAME__
let isle=null,user=null,offTheme=null
const toast=(text)=>message(text)
const theme=value=>{document.documentElement.dataset.theme=value.mode;document.documentElement.dataset.reducedMotion=String(!!value.reducedMotion)}
const open=what=>{
 if(!isle)return
 if(what==='battle')return UI.sheet(root,'擂台',document.createTextNode('擂台可通过尽欢的鱼鱼谷页面进入。'))
 if(what==='market')return UI.openMarket(root,isle)
 if(what==='bag')return UI.openBag(root,isle,()=>UI.openMarket(root,isle))
 if(what==='guide'){
  UI.openGuide(root)
  return
 }
 if(what==='auto')return UI.openAuto(root,isle,toast)
 if(what==='menu'){
  const body=document.createElement('div');body.className='mini-menu'
  const items=[['bag','🎒 背包']]
  items.push(['market','📚 杂货铺'],['auto','🤖 挂机管家'],['guide','📜 玩法说明'])
  for(const [key,label]of items){
   const button=document.createElement('button');button.type='button';button.textContent=label;button.className='isle-btn';button.addEventListener('click',()=>{panel.close();open(key)});body.append(button)
  }
  const panel=UI.sheet(root,GAME_NAME,body)
 }
}
async function boot(){
 try{
  user=await initialize()
  document.getElementById('mini-channel').textContent=user.channel==='sandbox'?'沙箱':''
  if(sdk.permissions.has('theme.read')){theme(await sdk.theme.get());offTheme=sdk.theme.onChange(theme)}
  isle=await mountIsle(root,{toast,user,onOpen:open})
  message(__MINI_CHORES__?'点场景互动，农田和牧场支持一键操作。':'点场景互动，作物和动物产物成熟后点一下收取。')
 }catch(error){root.replaceChildren();const note=document.createElement('p');note.className='mini-error';note.textContent=error.message||'小程序暂时无法加载，请稍后重新打开。';root.append(note);message('暂时无法进入')}
 finally{await sdk.lifecycle.ready().catch(()=>{})}
}
const cleanup=()=>{isle?.destroy?.();offTheme?.();dispose()}
addEventListener('pagehide',cleanup,{once:true})
void boot()
