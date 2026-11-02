import test from 'node:test';
import assert from 'node:assert/strict';
import {byId} from '../src/catalogue.mjs';
import {assess,evaluateJob} from '../src/engine.mjs';
import {decideNext} from '../src/plan.mjs';
import {screenWeek,monthRequest} from '../src/week.mjs';

const H=3600000;
const start=Date.parse('2026-11-05T09:00:00Z'); // 10:00 in Berlin
const job={location:'Berlin',dateTime:'2026-11-05T10:00',durationHours:4,surface:'mineral_render',paintId:'muresko'};
function forecast({temp=0,rainAt=[],rainChance=0,size=384}={}){
 const rains=new Set(rainAt);
 return {location:'Berlin',timezone:'Europe/Berlin',fetchedAt:'2026-11-02T00:00:00Z',hours:Array.from({length:size},(_,i)=>({at:start+i*H,temp,precip:rains.has(i)?1:0,precipProbability:rainChance,humidity:70,wind:4}))};
}
test('manufacturer sources list two exact cold-weather masonry products with showerproof—not stormproof—claims',()=>{
 const sandtex=byId('sandtex365'),zinsser=byId('zinsserallweather');
 assert.equal(sandtex.min,-10);assert.equal(zinsser.min,-5);
 assert.equal(sandtex.rainProtectionHours,1/3);assert.equal(zinsser.rainProtectionHours,1/3);
 assert.match(sandtex.source,/sandtexpaints\.com/);assert.match(zinsser.source,/zinsseruk\.com/);
 assert.match(sandtex.market,/UK product/);assert.match(zinsser.rainProtectionKind,/showerproof/);
});
test('rain during work is an actual conflict even at a temperature suitable for normal paint',()=>{
 const r=assess(byId('muresko'),job,forecast({temp:12,rainAt:[2]}));
 assert.equal(r.status,'conflict');assert.ok(r.rain.wetWork);assert.ok(r.conflicts.some(c=>c.code==='rain_during_work'));
});
test('rain during drying after application is separately reported, not mixed with working rain',()=>{
 const r=assess(byId('muresko'),job,forecast({temp:12,rainAt:[8]}));
 assert.ok(!r.rain.wetWork);assert.ok(r.rain.rainInScreen);assert.ok(r.cautions.some(c=>c.code==='rain_unverified'));
});
test('20 minute showerproof claim is preserved and is not treated as complete rain-proofness',()=>{
 const r=assess(byId('zinsserallweather'),{...job,paintId:'zinsserallweather'},forecast({temp:-2,rainAt:[6]}));
 assert.equal(r.status,'conditional');assert.equal(r.rain.earlyProtectionMinutes,20);
 assert.ok(r.cautions.some(c=>c.code==='rain_later'));
 assert.ok(r.unknown.some(c=>c.code==='rain_scope'));
 assert.equal(r.paint.temp.dryingMin,null,'do not invent drying-temperature min');
});
test('potential rain risk is shown if probability high even when no rain is currently forecast',()=>{
 const r=assess(byId('sandtex365'),{...job,paintId:'sandtex365'},forecast({temp:-2,rainChance:80}));
 assert.equal(r.rain.maxChanceDuringWork,80);assert.ok(r.cautions.some(c=>c.code==='rain_chance'));
});
test('at -2 C, cold-weather brand alternatives are genuinely evaluated, with UK availability caveat',()=>{
 const f=forecast({temp:-2});const r=evaluateJob(job,f);const d=decideNext(job,r,f);
 assert.ok(r.selected.conflicts.some(c=>c.code==='temp_low'));
 assert.ok(d.alternatives.some(p=>p.name.includes('Sandtex')&&p.min===-10));
 assert.ok(d.alternatives.some(p=>p.name.includes('Zinsser')&&p.min===-5));
 assert.ok(d.alternatives.every(p=>p.market.includes('UK')));
});
test('incompatible timber wall never receives masonry paint as suitable alternative',()=>{
 const r=evaluateJob({...job,surface:'wood'},forecast({temp:-2}));
 assert.equal(r.alternatives.length,0);
});
test('month screen never calls a rainy work hour suitable, even with a winter paint',()=>{
 const j={...job,paintId:'zinsserallweather'};
 const month=monthRequest('best dates this month in November',j,{now:Date.parse('2026-11-02')});
 const r=screenWeek(j,forecast({temp:-2,rainAt:[0,1,2,3,4,5,6,7,8,9,10]}),month,{now:Date.parse('2026-11-02'),includeAlternatives:false});
 assert.notEqual(r.rows.find(x=>x.date==='2026-11-05')?.status,'possible');
});

test('high predicted rain probability prevents a falsely optimistic date recommendation',()=>{
 const j={...job,paintId:'muresko'};const request=monthRequest('best dates this month November',j,{now:Date.parse('2026-11-02')});
 const result=screenWeek(j,forecast({temp:14,rainChance:85}),request,{now:Date.parse('2026-11-02'),includeAlternatives:false});
 assert.equal(result.possibleCount,0);assert.ok(result.rows.some(x=>x.status==='rain'));
});
