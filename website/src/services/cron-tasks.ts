type Task={name:string;run:()=>Promise<unknown>;every?:number;offset?:number}

// scheduledTime fixes the maintenance slot across delayed platform delivery.
// Do not add a global D1 lease: individual money/game jobs own their transactions.
export async function runCronTasks(at:number,tasks:Task[],report:(entry:{task:string;ms:number;ok:boolean})=>void=entry=>console.info('cron_task',JSON.stringify(entry))){
 const minute=Math.floor(at/60)
 for(const task of tasks){
  if(((minute-(task.offset??0))%(task.every??1)+(task.every??1))%(task.every??1)!==0)continue
  const start=Date.now();let ok=true
  try{await task.run()}catch{ok=false}
  const ms=Date.now()-start
  // Bounded diagnostic volume: failures and slow jobs only, no user payloads.
  if(!ok||ms>=1000)report({task:task.name,ms,ok})
 }
}
