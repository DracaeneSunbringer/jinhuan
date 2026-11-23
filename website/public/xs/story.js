// 大肥鱼修仙记 · 序章「商会来信」。进度存在 state.xs.st（服务端校验顺序），灵根存 state.xs.root。
// 0 渡口登岸 → 1 宗门广场测灵根 → 2 灵药园第一份差事（收获一株灵草）→ 3 向巡田使麦穗复命 → 4 序章完成
import {ROOTS} from './rules.js?v=20b20a0e';
const ME='大肥鱼';
export const GOALS=['前往宗门广场报到（渡口东北的石阶）','前往宗门广场报到（渡口东北的石阶）','去灵药园领差事（广场正北的石阶）','向巡田使麦穗复命（药园东边草地）','自由修行：药园种田、丹房炼丹、藏经阁太极蒲团打坐'];
export function createStory({x,send,dlg,toast,flush}){
 let running=false;
 const step=async n=>{const r=await send({a:'story',n});if(!r.ok)toast(r.msg,'bad');return r.ok};
 const goal=map=>(x.st||0)===2&&map==='garden'?'收割田里那株成熟的灵草':GOALS[Math.min(GOALS.length-1,x.st||0)];
 async function run(fn){if(running)return false;running=true;try{await fn();return true}finally{running=false}}
 return {
  goal,
  get active(){return running},
  async onEnter(map){const st=x.st||0;
   if(st===0&&map==='ferry')return run(async()=>{
    await dlg.say([
     {name:ME,text:'（攥着一封盖着金漆印的信）\n「星鱼谷商会 · 敬邀」……攒了三年的D币，总算换来这张船票。'},
     {name:ME,text:'信上说，云梦仙门每百年向凡间商会要一位「有田园之心」的人。\n田园之心……大概就是很会种地吧？'},
     {who:'52d',name:'52弟',face:0,text:'你就是星鱼谷来的大肥鱼？商会的举荐信我收到了。\n先去宗门广场报到，风祝师姐会给你测灵根。'},
     {who:'52d',name:'52弟',face:0,text:'走东北边的石阶上去就是。路上可以跟大家打个招呼——点人就能说话，点地面就能走过去。'}]);
    await step(1)});
   if(st===1&&map==='sect')return run(async()=>{
    await dlg.say([{who:'sup',name:'风祝',face:0,text:'新来的？手伸出来，放在这块测灵石上。\n……嗯，灵气在你掌心打转了。你自己感觉，它更像什么？'}],
     Object.entries(ROOTS).map(([el,name])=>({label:name+'灵根 · '+{metal:'锋利、坚定',wood:'生长、温润',water:'流动、包容',fire:'炽烈、果决',earth:'厚重、安稳'}[el],fn:()=>picked=el})));
    if(!picked)picked='wood';
    const r=await send({a:'root',el:picked});if(!r.ok&&!x.roots){toast(r.msg,'bad');return}await flush?.();
    const e=x.roots?.e||[picked],n=e.length,label=e.map(k=>ROOTS[k]).join('');
    await dlg.say([{who:'sup',name:'风祝',face:2,text:'测灵石亮了 '+n+' 道光——'+label+'，'+['','单灵根！天灵根百年难遇，前期修炼一日千里，只是功法只能修本属性。','双灵根，资质上佳，前期进境很快。','三灵根，中规中矩，稳扎稳打。','四灵根，前期会慢一些，但根基宽厚。','五行俱全的五灵根……前期慢如龟爬，可一旦熬过筑基、金丹，后劲远胜旁人。'][n]},
     {who:'sup',name:'风祝',face:0,text:n>1?'多灵根筑基之后可以在蒲团上尝试融合灵根，成了就是变异灵根，败了要伤些修为。':'单灵根不必融合，专心修本属性功法，效率翻倍。'},
     {who:'sup',name:'风祝',face:2,text:'从今天起你就是云梦仙门的外门弟子了。'},
     {who:'sup',name:'风祝',face:0,text:'外门弟子先干活再修行。去灵药园找麦穗领差事吧——广场正北那条石阶。\n锄头、水壶、几包灵草种子都给你备好了。'}]);
    picked=null;await step(2)});
   if(st===2&&map==='garden')return run(async()=>{
    await dlg.say([{who:'wheat',name:'麦穗',face:0,text:'唉，又来一个。\n前一个弟子留下的那株灵草已经熟了，你先把它收了，让我看看你会不会干活。'},
     {who:'wheat',name:'麦穗',face:0,text:'点田就行：长草的会锄，空田会种，种下会浇水，熟了会收。每一下都耗灵力，莫贪多。'}]);});
   return false},
  async onHarvest(){if((x.st||0)!==2)return;await step(3);toast('麦穗在东边的草地上朝你招手')},
  async onTalk(id){if(id!=='wheat'||(x.st||0)!==3)return false;return run(async()=>{
    await dlg.say([{who:'wheat',name:'麦穗',face:1,text:'手脚还算利索。\n这些金菇种子拿去，长得慢些，卖得也贵些。灵石攒够了，丹房的荷包会教你炼丹。'},
     {who:'wheat',name:'麦穗',face:0,text:'红尘俗事，种田就好。……去吧。'}]);
    if(await step(4))toast('序章完成：灵石 +30，金菇种子 ×3')})},
 };
 var picked=null;
}
