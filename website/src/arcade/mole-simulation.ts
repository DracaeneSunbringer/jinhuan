import {completeMoleDig,eligibleMoleEnemies,moleEngine,startMoleEncounter} from './mole-engine'
import type {MoleContext,MoleState} from './mole-engine'
import {advanceWorld,createWorld,finishWorldBattle,finishWorldDig} from './mole-world'
import type {World} from './mole-world'

// No browser-supplied elapsed time is accepted. The caller provides only a
// trusted clock and restores this state from its authoritative database row.
export type MoleSimulation={state:MoleState;world:World;lastTickAt:number;battleMs:number;healMs:number}
export function createMoleSimulation(state:MoleState,ctx:MoleContext):MoleSimulation{return {state:JSON.parse(JSON.stringify(state)),world:createWorld(state.activeZone,eligibleMoleEnemies(state),ctx.randomInt),lastTickAt:ctx.now*1000,battleMs:0,healMs:0}}
export function advanceMoleSimulation(input:MoleSimulation,ctx:MoleContext){
 const sim=JSON.parse(JSON.stringify(input)) as MoleSimulation,now=ctx.now*1000;if(!Number.isSafeInteger(now)||now<sim.lastTickAt)throw Error('服务端时间无效')
 // Bound one request while retaining the unprocessed cursor for subsequent
 // syncs. Paused time is discarded instead of becoming future progress.
 let remaining=Math.min(30000,now-sim.lastTickAt),delta=0
 sim.lastTickAt=sim.state.paused?now:sim.lastTickAt+remaining
 while(remaining>0&&!sim.state.paused){const ms=Math.min(100,remaining);remaining-=ms;sim.healMs+=ms
  if(sim.healMs>14000&&!sim.state.battle&&sim.state.hp<100+(sim.state.level-1)*12){sim.healMs=0;sim.state.hp=Math.min(100+(sim.state.level-1)*12,sim.state.hp+3)}
  if(sim.state.battle){sim.battleMs=Math.min(920,sim.battleMs+ms);if(sim.state.autoBattle&&sim.battleMs>=920){sim.battleMs-=920;const result=moleEngine.step(sim.state,'battle_round',{}, {...ctx,balance:ctx.balance+delta}) as {state:MoleState;delta:number};sim.state=result.state;delta+=result.delta;if(!sim.state.battle){finishWorldBattle(sim.world,ctx.randomInt);sim.battleMs=0}}continue}
  const collision=advanceWorld(sim.world,sim.state.activeZone,ms,ctx.randomInt)
  if(collision!==null){startMoleEncounter(sim.state,sim.world.enemies[collision].templateIndex);sim.battleMs=0;continue}
  if(sim.world.mole.phase==='dig'){sim.state.actionProgress+=ms/4200*(1+sim.state.skills.digger*.1+.08);if(sim.state.actionProgress>=1){delta+=completeMoleDig(sim.state,{...ctx,balance:ctx.balance+delta});finishWorldDig(sim.world,ctx.randomInt);sim.battleMs=0}}
 }
 sim.state.coins=ctx.balance+delta;return {sim,delta}
}
