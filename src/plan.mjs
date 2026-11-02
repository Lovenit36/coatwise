// Source-grounded, deterministic decisions. Dates are exploratory slots, never a site approval.
import {assess} from './engine.mjs';
import {byId} from './catalogue.mjs';
import {localToUTC,isoLocal} from './time.mjs';
const HOUR=3600000;
function localDateTime(ms,zone){return new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(ms));}
function lastHour(f){return f.hours.at(-1)?.at||0;}
function candidateWorks(paint,job,forecast,dateTime){
 let result;try{result=assess(paint,{...job,dateTime},forecast);}catch{return false;}
 if(result.conflicts.length||!result.coverageComplete)return false;
 const workStart=localToUTC(dateTime,forecast.timezone),workEnd=workStart+Number(job.durationHours)*HOUR;
 const workHours=result.hours.filter(h=>h.at>=workStart&&h.at<workEnd);
 // A dry forecast for the work hours alone is not proof of rain resistance.
 return workHours.length>=Number(job.durationHours)&&workHours.every(h=>h.temp!==null&&h.precip!==null&&h.precip<=.05&&(!Number.isFinite(h.precipProbability)||h.precipProbability<60));
}
export function suggestWindows(paint,job,forecast,{count=3}={}){
 const requested=localToUTC(job.dateTime,forecast.timezone);
 const requestedHour=Number(job.dateTime.slice(11,13));
 const times=[requestedHour,...[9,10,11,12,13].filter(h=>h!==requestedHour)].filter(h=>h>=7&&h<=15);
 const found=[];
 // Prefer the painter's existing start hour on later days, then other daylight hours.
 for(let days=1;days<=15&&found.length<count;days++){
  const day=new Date(Date.parse(job.dateTime.slice(0,10)+'T12:00:00Z')+days*24*HOUR);
  const dayLabel=day.toISOString().slice(0,10);
  for(const hour of times){
   const dt=`${dayLabel}T${String(hour).padStart(2,'0')}:${job.dateTime.slice(14,16)}`;
   let utc;try{utc=localToUTC(dt,forecast.timezone);}catch{continue;}
   if(utc<=requested||utc<=Date.now()||utc>=lastHour(forecast))continue;
   if(candidateWorks(paint,job,forecast,dt)){
    found.push({dateTime:dt,display:localDateTime(utc,forecast.timezone),reason:'No documented numeric temperature breaches during the conservative screening period; no forecast rain during application. Site checks still required.'});break;
   }
  }
 }
 return found;
}
export function decideNext(job,report,forecast){
 const selected=report.selected;
 const hasConflict=selected.conflicts.length>0;
 const options=hasConflict?suggestWindows(job.paintId==='uploaded'?job.uploadedPaint:byId(job.paintId),job,forecast):[];
 const alternative=report.alternatives.map(a=>({id:a.paint.id,name:`${a.paint.brand} ${a.paint.name}`,source:a.paint.source,min:a.paint.temp.min,earlyProtectionMinutes:a.paint.rainProtectionHours===null?null:Math.round(a.paint.rainProtectionHours*60),protectionKind:a.paint.rainProtectionKind,market:a.paint.market,unknowns:a.unknown.length,reason:a.reason}));
 const criticalMissing=selected.unknown.some(u=>u.code==='surface'||u.code==='forecast_gap');
 const title=hasConflict?'Weather conflict — change the plan':criticalMissing?'Not enough verified information':'Weather limits checked — site checks required';
 const reason=hasConflict?selected.conflicts.find(c=>c.code==='rain_during_work'||c.code==='temp_low'||c.code==='temp_high'||c.code==='surface')?.message||'Documented manufacturer requirement is not met.':criticalMissing?'A required surface or forecast check is unresolved.':'No documented numeric temperature conflict during the checked period; this is not approval to paint.';
 const missing=[];
 if(selected.paint.id==='uploaded')missing.push('Confirm exact product/variant and datasheet edition with its manufacturer.');
 if(selected.unknown.some(x=>x.code==='surface'||x.code==='surface_check'))missing.push('Confirm wall material, existing coating and primer on site.');
 missing.push('Measure actual wall temperature and moisture before starting.');
 if(selected.unknown.some(x=>x.code==='rain_unknown'))missing.push('Check maker’s rain/dew protection guidance; recoating time is not rain resistance.');
 if(selected.rain?.maxChanceDuringWork>=60)missing.push('Rain may develop during work. Check the updated radar and protect the wall.');
 // Manufacturer-documented component-system alternative, not an unqualified paint substitution.
 // Caparol explicitly lists Muresko with its Trocknungsbeschleuniger for cooler conditions.
 const specialistLeads=hasConflict&&selected.paint.id==='muresko'?[{
   name:'Muresko + Caparol Trocknungsbeschleuniger',
   source:'https://www.caparol.de/en/product-range/paints/supplementary-products/additiv-fuer-die-kuehle-jahreszeit/trocknungsbeschleuniger',
   note:'Caparol documents this Muresko additive system for +1 to +10°C air/substrate and early rain resistance after about 1 hour. Check exact instructions and wall temperature; this option is not automatically cleared.',
   min:1,max:10,kind:'documented_additive'}]:[];
 if(hasConflict&&!specialistLeads.length&&!alternative.length)specialistLeads.push({
   name:'StoColor Silco + StoAdditiv QS (separate product system)',
   source:'https://www.sto.de/webdocs/productdocuments/TechnicalDataSheet_StoAdditiv_QS_0101_DE_04_00.PDF',
   note:'Sto documents a +1°C minimum for selected paint/additive systems. Check exact paint and additive versions plus surface requirements before changing.'
 });
 const ask=hasConflict&&!alternative.length?'Check the documented cold-weather system below or change the date. The wall must be dry and free of frost.':!hasConflict?'Is the wall newly rendered or previously painted? Tell me, or upload the paint datasheet if you want a product-specific check.':'I found alternatives to investigate. Please confirm the exact product variant and existing wall coating before switching.';
 return {rain: selected.rain, verdict:hasConflict?'reschedule_or_change_paint':criticalMissing?'insufficient_evidence':'conditional',title,reason,alternatives:alternative,specialistLeads,nextWindows:options,questions:missing.slice(0,3),ask,screeningNote:'Later dates are forecast-based candidates, not guarantees of curing or safe painting. Reference drying hours are not validated under forecast conditions.'};
}
