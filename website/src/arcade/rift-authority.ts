import type {TrustedArcadeEngine} from './action-service'

// The factory must be a fixed, audited server bundle, never a client input.
// It is injected here to keep the still-experimental extraction off all routes.
type Snapshot={state:Record<string,any>;virtualMs:number;lastSeenAt:number;jobs:Array<unknown>;[key:string]:unknown}
type Core={snapshot:()=>Snapshot;advance:(ms:number)=>void;startBattle:()=>void;stopBattle:()=>void;changeFloor:(delta:number)=>void;rebirth:()=>unknown;newGame:()=>void;configure:(name:string,value:boolean|number,id?:string)=>void;actions:Record<string,(...args:any[])=>unknown>}
type Factory=(ctx:{now:number;randomInt:(max:number)=>number},saved?:Snapshot)=>Core
function exact(args:Record<string,unknown>,keys:string[]){if(Object.keys(args).length!==keys.length||keys.some(k=>!Object.hasOwn(args,k)))throw Error('动作参数无效')}
function int(value:unknown,min:number,max:number){if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)throw Error('动作参数无效');return Number(value)}
function key(value:unknown){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(value)||['__proto__','prototype','constructor'].includes(value))throw Error('动作参数无效');return value}
function oneOf(value:unknown,allowed:string[]){if(typeof value!=='string'||!allowed.includes(value))throw Error('动作参数无效');return value}
function prepare(action:string,args:Record<string,unknown>):(core:Core)=>void{
 const noArgs:Record<string,(c:Core)=>void>={tick:()=>{},start:c=>c.startBattle(),stop:c=>c.stopBattle(),potion:c=>{c.actions.usePotion()},sell_low:c=>{c.actions.sellLowQuality()},boss:c=>{c.actions.challengeBoss()},wash:c=>{c.actions.washPoints()},rebirth:c=>{c.rebirth()},reset:c=>c.newGame(),retreat:c=>{c.actions.retreatExped(false)}}
 if(Object.hasOwn(noArgs,action)){exact(args,[]);return noArgs[action]}
 switch(action){
 case 'shop':{exact(args,['id','qty']);const id=key(args.id),qty=int(args.qty,1,1000);return c=>{c.actions.buyShopItem(id,qty)}}
 case 'floor':{exact(args,['delta']);const value=int(args.delta,-10,10);if(![-10,-1,1,10].includes(value))throw Error('动作参数无效');return c=>c.changeFloor(value)}
 case 'speed':{exact(args,['value']);const value=int(args.value,1,3);return c=>{c.actions.setSpeed(value)}}
 case 'sweep':{exact(args,['count']);const count=int(args.count,1,100);if(![1,10,100].includes(count))throw Error('动作参数无效');return c=>{c.actions.sweepFloor(count)}}
 case 'scroll':{exact(args,['count']);const count=int(args.count,1,1000);return c=>{c.actions.useScroll(count)}}
 case 'attribute':{exact(args,['id','count']);const id=oneOf(args.id,['str','con','agi','luk']),count=int(args.count,1,1000);return c=>{c.actions.allocAttr(id,count)}}
 case 'skill':{exact(args,['id']);const id=oneOf(args.id,['strike','heal','interrupt','ironWall','frenzy','execute','shieldWall','bloodlust']);return c=>{c.actions.useSkill(id)}}
 case 'event':{exact(args,['index']);const index=int(args.index,0,20);return c=>{c.actions.resolveEvent(index)}}
 case 'equip':case 'sell':case 'reforge':{exact(args,['id']);const id=key(args.id),method=({equip:'equipItem',sell:'sellItem',reforge:'reforgeItem'} as const)[action];return c=>{c.actions[method](id)}}
 case 'unequip':{exact(args,['slot']);const slot=oneOf(args.slot,['weapon','helmet','chest','gloves','boots','necklace','ring1','ring2']);return c=>{c.actions.unequipSlot(slot)}}
 case 'enhance':{exact(args,['id','protect']);const id=key(args.id);if(typeof args.protect!=='boolean')throw Error('动作参数无效');const protect=args.protect;return c=>{c.actions.enhanceItem(id,protect)}}
 case 'lock':{exact(args,['id','index']);const id=key(args.id),index=int(args.index,0,20);return c=>{c.actions.toggleLock(id,index)}}
 case 'transfer':{exact(args,['from','to']);const from=key(args.from),to=key(args.to);return c=>{c.actions.transferEnhance(from,to)}}
 case 'talent':{exact(args,['id']);const id=oneOf(args.id,['atk','hp','gold','exp','drop','startFloor','tickets','eliteRate','eventSlot','startBless']);return c=>{c.actions.buyTalent(id)}}
 case 'rune':{exact(args,['id','index']);const id=oneOf(args.id,['strike','heal','interrupt','ironWall','frenzy','execute','shieldWall','bloodlust']),index=int(args.index,0,2);return c=>{c.actions.activateRune(id,index)}}
 case 'map_node':{exact(args,['floor','lane']);const floor=int(args.floor,1,100000),lane=int(args.lane,0,10);return c=>{c.actions.chooseMapNode(floor,lane)}}
 case 'teleport':{exact(args,['tier']);const tier=int(args.tier,1,10000);return c=>{c.actions.teleportToTier(tier)}}
 case 'map_strategy':{exact(args,['id']);const id=oneOf(args.id,['safe','loot','gold']);return c=>{c.actions.setMapStrategy(id)}}
 case 'setting':{exact(args,['name','value']);const name=oneOf(args.name,['autoAlloc','autoNext','autoEvents','autoScroll','autoPotion','autoRetreat','autoSweepOnDeath','autoEquip','autoSalvage']);if(typeof args.value!=='boolean')throw Error('动作参数无效');const value=args.value;return c=>c.configure(name,value)}
 case 'auto_cast':{exact(args,['id','value']);const id=oneOf(args.id,['strike','heal','interrupt','ironWall','frenzy','execute','shieldWall','bloodlust']);if(typeof args.value!=='boolean')throw Error('动作参数无效');const value=args.value;return c=>c.configure('autoCast',value,id)}
 case 'salvage_quality':{exact(args,['id','value']);const id=oneOf(args.id,['common','fine','rare','epic','legendary','mythic']);if(typeof args.value!=='boolean')throw Error('动作参数无效');const value=args.value;return c=>c.configure('salvageQuality',value,id)}
 case 'salvage_tier':{exact(args,['value']);const value=int(args.value,0,11);return c=>c.configure('salvageTier',value)}
 default:throw Error('游戏动作不支持')
 }
}
export function createRiftAuthority(factory:Factory):TrustedArcadeEngine{return {
 initial(ctx){const s=factory(ctx).snapshot();s.state.gold=ctx.balance;s.lastSeenAt=ctx.now*1000;return s},
 present(input,balance){const s=JSON.parse(JSON.stringify(input)) as Snapshot;s.state.gold=balance;return s},
 step(input,action,args,ctx){
  const run=prepare(action,args),s=JSON.parse(JSON.stringify(input)) as Snapshot,now=ctx.now*1000
  if(!s?.state||!Number.isSafeInteger(s.virtualMs)||!Number.isSafeInteger(s.lastSeenAt)||now<s.virtualMs||now<s.lastSeenAt)throw Error('可信游戏时间无效')
  const away=now-s.lastSeenAt
  if(action==='tick'&&away<10000&&now-s.virtualMs<=10000)throw Error('同步过于频繁，请稍候')
  // Original foreground catch-up is limited to four hours. Retain the
  // remainder across bounded commits so elapsed play is never paid twice.
  if(away>4*60*60*1000)s.virtualMs=Math.max(s.virtualMs,now-4*60*60*1000)
  const active=!!s.state.inBattle||!!s.state.autoSweepActive||!!s.jobs?.length
  if(!active)s.virtualMs=now
  if(action!=='tick'&&now-s.virtualMs>30000)throw Error('游戏进度正在补算，请先同步')
  s.state.gold=ctx.balance
  const core=factory(ctx,s);core.advance(Math.min(30000,now-s.virtualMs));run(core)
  const out=core.snapshot(),balance=out.state.gold,delta=balance-ctx.balance
  if(!Number.isSafeInteger(balance)||balance<0||!Number.isSafeInteger(delta))throw Error('游戏余额无效')
  out.lastSeenAt=now
  return {state:out,delta,rankLevel:int(out.state.level,1,1e9),rankDepth:int(out.state.maxFloor,1,1e9),rankActions:int(out.state.stats?.kills??0,0,1e9)}
 }
}}
