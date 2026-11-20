import {moleEngine} from './mole-engine'
import type {MoleContext,MoleState} from './mole-engine'
import {advanceMoleSimulation,createMoleSimulation} from './mole-simulation'
import type {MoleSimulation} from './mole-simulation'
import {finishWorldBattle} from './mole-world'
import type {TrustedArcadeEngine} from './action-service'

type Saved=MoleState&{_simulation:Omit<MoleSimulation,'state'>}
type Result={state:MoleState;delta:number;rankLevel:number;rankDepth:number;rankActions:number}
function pack(sim:MoleSimulation):Saved{return {...sim.state,_simulation:{world:sim.world,lastTickAt:sim.lastTickAt,battleMs:sim.battleMs,healMs:sim.healMs}}}
function unpack(input:unknown):MoleSimulation{const saved=JSON.parse(JSON.stringify(input)) as Saved;if(!saved?._simulation?.world||!Number.isSafeInteger(saved._simulation.lastTickAt))throw Error('可信游戏世界无法读取');const {_simulation,...state}=saved;return{state, ..._simulation}}
function plain(args:Record<string,unknown>){if(Object.keys(args).length)throw Error('动作参数无效')}
function option(args:Record<string,unknown>){if(Object.keys(args).length!==1||typeof args.value!=='boolean')throw Error('动作参数无效');return args.value}

// Adapter remains internal until every action and the original UI use this
// authoritative state. Never register the legacy client-owned engine here.
export const trustedMoleEngine:TrustedArcadeEngine={
 initial(ctx){return pack(createMoleSimulation(moleEngine.initial(ctx) as MoleState,ctx))},
 present(input,balance){return {...input as Saved,coins:balance}},
 step(input,action,args,ctx){
  if(action==='tick')plain(args)
  if(action==='offline')throw Error('游戏动作不支持')
  if(action==='pause'||action==='auto_battle')option(args)
  let sim=unpack(input),delta=0
  const elapsed=ctx.now*1000-sim.lastTickAt,away=ctx.now*1000-sim.state.lastSavedAt
  // Passive sync is deliberately coarser than the visual animation. This
  // bounds D1 writes even if a client requests game ticks more aggressively.
  if(action==='tick'&&away<10000&&elapsed<=10000)throw Error('同步过于频繁，请稍候')
  if(action!=='tick'&&away<120000&&elapsed>30000&&!sim.state.paused)throw Error('游戏进度正在补算，请先同步')
  if(away>=120000&&sim.state.paused)sim.lastTickAt=ctx.now*1000
  else if(away>=120000){if(sim.state.battle){delete sim.state.battle;finishWorldBattle(sim.world,ctx.randomInt);sim.battleMs=0}const offline=moleEngine.step(sim.state,'offline',{},ctx) as Result;sim.state=offline.state;delta=offline.delta;sim.lastTickAt=ctx.now*1000}
  else {const advanced=advanceMoleSimulation(sim,ctx);sim=advanced.sim;delta=advanced.delta}
  if(action==='pause'){if(sim.state.battle)throw Error('战斗中不能暂停');sim.state.paused=option(args)}
  else if(action==='auto_battle')sim.state.autoBattle=option(args)
  else if(action!=='tick'){
   if(action==='battle_round'){if(sim.battleMs<920)throw Error('出手过快，请稍候');sim.battleMs=0}
   const hadBattle=!!sim.state.battle
   const result=moleEngine.step(sim.state,action,args,{...ctx,balance:ctx.balance+delta}) as Result
   sim.state=result.state;delta+=result.delta
   if(action==='reset'||action==='map'||action==='zone')sim=createMoleSimulation(sim.state,{...ctx,balance:ctx.balance+delta})
   else if(hadBattle&&!sim.state.battle){finishWorldBattle(sim.world,ctx.randomInt);sim.battleMs=0}
  }
  sim.state.lastSavedAt=ctx.now*1000;sim.state.coins=ctx.balance+delta
  return {state:pack(sim),delta,rankLevel:sim.state.level,rankDepth:sim.state.depth,rankActions:sim.state.totalDigs}
 }
}
