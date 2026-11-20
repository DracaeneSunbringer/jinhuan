export type Player={id:number;name:string;avatar:string|null;alive?:boolean;role?:'ordinary'|'spy'|'blank';word?:string|null}
export type Stroke={id:string;user_id:number;points:number[][];color:string;width:number}
export type DrawingRoom={id:string;host_id:number;min_players:number;spies:number;blank:boolean;words:string[];players:Player[];phase:'lobby'|'drawing'|'vote'|'finished';round:number;turn:number;deadline:number;strokes:Stroke[];votes:Record<string,number>;voteRun:number;candidates:number[];pauseRemaining:number;voteCooldown:number;lastVote:unknown;winner:string|null;revision:number;created_at:number}
const error=(message:string):never=>{throw Error(message)}
function options(n:number,spies:number,blank:boolean){if(!Number.isInteger(n)||n<3||n>8||![1,2].includes(spies)||n<5&&(spies!==1||blank)||spies+Number(blank)>=n-spies-Number(blank))error('请选择3–8人；3/4人局单卧底无空白牌，卧底阵营须少于普通玩家')}
export function drawingCreate(b:{id:string;host:Player;min_players:number;spies:number;blank?:boolean;words:string[]},at:number):DrawingRoom{
 options(b.min_players,b.spies,!!b.blank);if(b.words.length!==2||b.words.some(w=>typeof w!=='string'||!w.trim()||[...w].length>20)||b.words[0]===b.words[1])error('需要两个不同的相近词语');
 return {id:b.id,host_id:b.host.id,min_players:b.min_players,spies:b.spies,blank:!!b.blank,words:b.words.map(w=>w.trim()),players:[{...b.host,alive:true}],phase:'lobby',round:0,turn:0,deadline:0,strokes:[],votes:{},voteRun:1,candidates:[],pauseRemaining:5000,voteCooldown:0,lastVote:null,winner:null,revision:0,created_at:at};
}
function advance(s:DrawingRoom,at:number){let next=s.turn;do{next++;if(next>=s.players.length){next=0;s.round++}}while(!s.players[next].alive);s.turn=next;s.deadline=at+5000}
function win(s:DrawingRoom){const alive=s.players.filter(p=>p.alive),bad=alive.filter(p=>p.role!=='ordinary').length,good=alive.length-bad;if(!bad||bad>=good){s.phase='finished';s.winner=bad?'undercover':'ordinary';s.deadline=0;return true}return false}
function finishVote(s:DrawingRoom,at:number){
 const counts=new Map<number,number>();Object.values(s.votes).forEach(id=>counts.set(id,(counts.get(id)||0)+1));const highest=Math.max(0,...counts.values()),leaders=[...counts].filter(([,n])=>n===highest).map(([id])=>id);
 if(leaders.length>1&&s.voteRun===1){s.voteRun=2;s.candidates=leaders;s.votes={};s.deadline=at+20000;return}
 const removed=s.round>=4&&leaders.length===1?leaders[0]:null;if(removed)s.players.find(p=>p.id===removed)!.alive=false;
 s.lastVote={round:s.round,counts:Object.fromEntries(counts),eliminated:removed,informational:s.round<=3,tie:leaders.length!==1};s.phase='drawing';s.votes={};s.candidates=[];s.voteCooldown=at+10000;s.deadline=at+s.pauseRemaining;
 if(removed&&!win(s)&&!s.players[s.turn].alive)advance(s,at)
}
export function drawingTick(s:DrawingRoom,at:number){
 if(s.phase==='drawing'&&at>=s.deadline){advance(s,at);s.revision++}
 else if(s.phase==='vote'&&at>=s.deadline){finishVote(s,at);s.revision++}
 return s;
}
export function drawingStrokeAllowed(s:DrawingRoom,uid:number,b:Record<string,any>,at:number){
 if(s.phase!=='drawing'||at>=s.deadline||s.players[s.turn].id!==uid||!s.players.find(p=>p.id===uid)?.alive)error('只能在自己的5秒内作画');
 if(!Array.isArray(b.points)||b.points.length<2||b.points.length>128||b.points.some((p:unknown)=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))||!/^#[a-f0-9]{6}$/i.test(b.color)||!Number.isInteger(b.width)||b.width<1||b.width>12)error('笔画格式无效');
}
export function drawingAction(s:DrawingRoom,uid:number,type:string,b:Record<string,any>,at:number,random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296){
 drawingTick(s,at);
 if(type==='join'){
  if(s.phase!=='lobby')error('游戏已开始');if(s.players.some(p=>p.id===uid))return s;if(s.players.length>=8)error('最多8人');if(b.player?.id!==uid)error('玩家身份不匹配');s.players.push({...b.player,alive:true});s.revision++;return s;
 }
 const me=s.players.find(p=>p.id===uid);if(!me)error('请先加入房间');
 if(type==='leave'&&s.phase==='lobby'){if(uid===s.host_id)error('房主请结束房间');s.players=s.players.filter(p=>p.id!==uid);s.revision++;return s}
 if(type==='finish'){if(uid!==s.host_id)error('仅房主可结束');s.phase='finished';s.winner='cancelled';s.deadline=0;s.revision++;return s}
 if(type==='start'){
  if(uid!==s.host_id||s.phase!=='lobby')error('仅房主可开始等待中的房间');if(s.players.length<s.min_players)error('参与人数不足');options(s.players.length,s.spies,s.blank);
  const shuffled=[...s.players];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
  shuffled.forEach((p,i)=>{p.role=i<s.spies?'spy':i===s.spies&&s.blank?'blank':'ordinary';p.word=p.role==='blank'?null:s.words[p.role==='spy'?1:0]});s.phase='drawing';s.round=1;s.turn=0;s.deadline=at+5000;
 }else if(type==='vote-start'){
  if(s.phase!=='drawing'||!me!.alive)error('当前不能发起投票');if(at<s.voteCooldown)error('投票刚结束，请稍后再发起');s.pauseRemaining=Math.max(1,s.deadline-at);s.phase='vote';s.votes={};s.voteRun=1;s.candidates=s.players.filter(p=>p.alive).map(p=>p.id);s.deadline=at+20000;
 }else if(type==='vote'){
  if(s.phase!=='vote'||!me!.alive||!s.candidates.includes(b.target))error('投票对象无效');if(uid in s.votes)error('本次已投票');s.votes[uid]=b.target;if(Object.keys(s.votes).length===s.players.filter(p=>p.alive).length)finishVote(s,at);
 }else if(type==='stroke'){
  drawingStrokeAllowed(s,uid,b,at);if(s.strokes.length>=500)error('画布笔画已满，请结束本局');
  s.strokes.push({id:crypto.randomUUID(),user_id:uid,points:b.points,color:b.color,width:b.width});
 }else if(type==='undo'){
  if(s.phase!=='drawing'||s.players[s.turn].id!==uid)error('只能在自己的回合作画');let index=s.strokes.length-1;while(index>=0&&s.strokes[index].user_id!==uid)index--;if(index>=0)s.strokes.splice(index,1);
 }else error('操作无效');s.revision++;return s;
}
export function drawingView(s:DrawingRoom,uid:number,canvas=true){
 const me=s.players.find(p=>p.id===uid);return {id:s.id,mode:'drawing',host_id:s.host_id,min_players:s.min_players,spies:s.spies,blank:s.blank,phase:s.phase,round:s.round,turn_user_id:s.players[s.turn]?.id,deadline:s.deadline,revision:s.revision,winner:s.winner,
  players:s.players.map(({word,role,...p})=>({...p,...(s.phase==='finished'?{word,role}:{})})),me:me?{id:me.id,alive:me.alive,...(s.phase!=='lobby'?{word:me.word}:{}),...(s.phase==='finished'?{role:me.role}:{})}:null,
  ...(canvas?{strokes:s.strokes}:{}),vote:s.phase==='vote'?{run:s.voteRun,candidates:s.candidates,count:Object.keys(s.votes).length,mine:s.votes[uid]??null,informational:s.round<=3}:null,last_vote:s.lastVote,vote_cooldown:s.voteCooldown};
}
