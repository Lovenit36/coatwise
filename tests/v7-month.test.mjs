import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {monthRequest,scheduleRequest,screenWeek} from '../src/week.mjs';
import {localToUTC} from '../src/time.mjs';

const zone='Europe/Berlin';
const job={location:'Berlin',dateTime:'2026-11-06T01:00',durationHours:3,surface:'mineral_render',paintId:'muresko'};
const start=localToUTC('2026-11-02T00:00',zone);
const nov2=Date.parse('2026-11-02T00:00:00Z');
const fixture=(temp,precip=()=>0)=>({location:'Berlin',timezone:zone,fetchedAt:'2026-11-02T02:00:00Z',hours:Array.from({length:384},(_,i)=>({at:start+i*3600000,temp:temp(start+i*3600000,i),precip:precip(start+i*3600000,i),humidity:65,wind:3}))});

test('recognises this month of Nov and checks all calendar days without asking to click a button',()=>{
 const req=monthRequest('can u check for the dates in this month of nov best suitable for this job',job,{now:nov2});
 assert.deepEqual([req.kind,req.start,req.end,req.count],['month','2026-11-01','2026-11-30',30]);
 assert.equal(scheduleRequest('can u check for dates this month of nov',job),null);
 const warmAfter=localToUTC('2026-11-07T00:00',zone);
 const result=screenWeek(job,fixture(at=>at>=warmAfter?9:3),req,{now:nov2});
 assert.equal(result.rows.length,30);
 assert.ok(result.possibleCount>0);
 assert.ok(result.bestDates.every(r=>r.status==='possible'&&r.dateTime.startsWith('2026-11')&&r.date>='2026-11-06'));
 assert.equal(result.bestDates.length,3);
 assert.ok(result.unavailableCount>0);
 assert.ok(result.checkedCount<30);
});
test('rain during drying prevents a false positive weather candidate',()=>{
 const req=monthRequest('best dates November 2026 for painting',job,{now:nov2});
 const result=screenWeek(job,fixture(()=>12,()=>1),req,{now:nov2});
 assert.equal(result.possibleCount,0);
 assert.ok(result.rows.some(r=>r.status==='avoid'&&/rain/i.test(r.reason)));
 assert.equal(result.bestDates.length,0);
});
test('cold weather or incomplete horizon is not reported as suitable',()=>{
 const req=monthRequest('find me the best painting days during November',job,{now:nov2});
 const result=screenWeek(job,fixture(()=>3),req,{now:nov2});
 assert.equal(result.possibleCount,0);
 assert.ok(result.unavailableCount>0);
 assert.ok(result.rows.some(r=>r.status==='avoid'));
});
test('explicit month and year plus next month work; unrelated chat stays conversational',()=>{
 assert.equal(monthRequest('Check December 2026 weather dates',job,{now:nov2}).start,'2026-12-01');
 assert.equal(monthRequest('best dates next month',job,{now:nov2}).start,'2026-12-01');
 assert.equal(monthRequest('How does the primer affect paint?',job,{now:nov2}),null);
 assert.equal(monthRequest('What about November?',job,{now:nov2}),null);
});

test('signed POST /api/chat checks November immediately and returns a grounded month answer',async()=>{
 const original=global.fetch;
 process.env.NODE_ENV='test';
 const {handler}=await import('../server.mjs');
 const berlinParts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 const chosen=`${berlinParts.year}-${berlinParts.month}-${berlinParts.day}`;
 const nextDay=new Date(Date.parse(chosen+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const serverJob={location:'Berlin',dateTime:nextDay+'T10:00',durationHours:3,surface:'mineral_render',paintId:'muresko'};
 const todayUtc=Math.floor(Date.now()/86400000)*86400;
 let forecastCalls=0;
 global.fetch=async url=>{
  if(String(url).includes('geocoding-api'))return {ok:true,json:async()=>({results:[{name:'Berlin',country_code:'DE',latitude:52.52,longitude:13.4,timezone:zone}]})};
  if(String(url).includes('/forecast')){
   forecastCalls++;
   const time=Array.from({length:384},(_,i)=>todayUtc+i*3600);
   return {ok:true,json:async()=>({timezone:zone,hourly:{time,temperature_2m:time.map(()=>10),relative_humidity_2m:time.map(()=>65),precipitation:time.map(()=>0),precipitation_probability:time.map(()=>0),wind_speed_10m:time.map(()=>4)}})};
  }
  throw Error('Unexpected external URL in month test: '+url);
 };
 const server=createServer(handler);
 const nativeFetch=original;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function post(path,obj){const r=await nativeFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});return {status:r.status,body:await r.json()};}
 try{
  const check=await post('/api/check',serverJob);
  assert.equal(check.status,200,JSON.stringify(check.body));
  const r=check.body;
  const signed={job:r.job,forecast:{location:r.forecast.location,timezone:r.forecast.timezone,fetchedAt:r.forecast.fetchedAt},selected:{status:r.selected.status,paint:r.selected.paint,conflicts:r.selected.conflicts.slice(0,25),cautions:r.selected.cautions.slice(0,20),unknown:r.selected.unknown.slice(0,25),hours:r.selected.hours.slice(0,100)},alternatives:r.alternatives.map(x=>({paint:x.paint,reason:x.reason,conflicts:x.conflicts,unknown:x.unknown.slice(0,6)})),decision:r.decision};
  const question=`Can you find the best dates for this job in ${new Intl.DateTimeFormat('en-GB',{timeZone:zone,month:'long'}).format(new Date())}?`;
  const response=await post('/api/chat',{question,result:signed,reportSignature:r.contextSignature});
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.period.kind,'month');
  assert.ok(response.body.period.rows.length>=28);
  assert.ok(response.body.period.bestDates.length>0);
  assert.match(response.body.answer,/Best forecast|Best weather/i);
  assert.ok(response.body.answer.includes('at '));
  assert.equal(forecastCalls,2,'chat must fetch a fresh forecast');
 }finally{global.fetch=original;await new Promise(resolve=>server.close(resolve));}
});
