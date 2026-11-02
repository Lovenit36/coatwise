import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const whitelist=new Set(['landing_view','tool_started','result_generated','ai_result_generated','result_used','plancraft_cta_clicked']);
const filename=join(process.env.EVENTS_DIR||join(process.cwd(),'data'),'events.jsonl');
const RETENTION_DAYS=30;
let queue=Promise.resolve(),lastPrune=0;
export function parseEvent(x){
 if(!x||!whitelist.has(x.event)||typeof x.sessionId!=='string'||!/^[-0-9a-f]{36}$/i.test(x.sessionId))throw new Error('Invalid analytics event.');
 return {id:randomUUID(),experimentId:'paint_advisor',event:x.event,sessionId:x.sessionId,at:new Date().toISOString(),source:typeof x.source==='string'?x.source.slice(0,64):'direct',outcome:typeof x.outcome==='string'?x.outcome.slice(0,32):null};
}
async function pruneOldEvents(now){
 let data='';try{data=await fs.readFile(filename,'utf8')}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!data)return;
 const threshold=now-RETENTION_DAYS*86400000;
 const rows=data.trim().split('\n').filter(Boolean).filter(line=>{try{const e=JSON.parse(line);return new Date(e.at).getTime()>=threshold}catch{return false}});
 await fs.writeFile(filename,rows.length?rows.join('\n')+'\n':'',{mode:0o600});
}
export function writeEvent(x){
 const e=parseEvent(x);
 const task=queue.then(async()=>{
  await fs.mkdir(join(filename,'..'),{recursive:true});
  const now=Date.now();if(now-lastPrune>86400000){await pruneOldEvents(now);lastPrune=now;}
  await fs.appendFile(filename,JSON.stringify(e)+'\n',{encoding:'utf8',mode:0o600});
  return e;
 });
 queue=task.catch(()=>{});return task;
}
export async function eventStats(){
 await queue;
 let data='';try{data=await fs.readFile(filename,'utf8')}catch(e){if(e.code!=='ENOENT')throw e;}
 const events=data.trim().split('\n').filter(Boolean).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean);
 const byName={};for(const e of events)(byName[e.event]??=new Set()).add(e.sessionId);
 return {retentionDays:RETENTION_DAYS,totalEvents:events.length,uniqueSessions:byName.landing_view?.size||0,started:byName.tool_started?.size||0,results:byName.result_generated?.size||0,aiResults:byName.ai_result_generated?.size||0,used:byName.result_used?.size||0,ctaClickers:byName.plancraft_cta_clicked?.size||0,ctaRate:byName.result_generated?.size?((byName.plancraft_cta_clicked?.size||0)/byName.result_generated.size):null};
}
