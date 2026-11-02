import {byId,catalogue,surfaces} from './catalogue.mjs';
import {localToUTC,isoLocal} from './time.mjs';
const H=3600000;
function finiteOrNull(n){return n===null||n===undefined?null:(Number.isFinite(n)?n:null)}
function pushUnique(list,entry){if(!list.some(x=>x.code===entry.code&&x.at===entry.at))list.push(entry)}
export function assess(paint,{dateTime,durationHours,surface},forecast){
 const start=localToUTC(dateTime,forecast.timezone), duration=Number(durationHours);
 if(!Number.isFinite(duration)||duration<1||duration>16) throw new Error('Painting duration must be between 1 and 16 hours');
 if(!surfaces[surface]) throw new Error('Choose a listed facade surface');
 const appliedUntil=start+duration*H;
 // 72h only if manufacturer explicitly provides reference full curing; not a guarantee at other temperatures.
 // If manufacturer provides only recoating duration, that is a limited screening window, never rainproof/cured.
 const screeningHours=paint.referenceHours??paint.recoatHours??0;
 const until=appliedUntil+Math.max(screeningHours,paint.rainProtectionHours??0)*H;
 const data=[...forecast.hours].sort((a,b)=>a.at-b.at);
 const findings=[],unknown=[];
 const add=(status,code,message,at=null,phase=null)=>pushUnique(status==='conflict'?findings:status==='caution'?findings:unknown,{status,code,message,at,phase});
 const relevant=data.filter(h=>h.at>=Math.floor(start/H)*H&&h.at<until);
 const rainProtectionEnd=appliedUntil+(paint.rainProtectionHours??0)*H;
 const needed=Math.ceil((until-Math.floor(start/H)*H)/H);
 if(relevant.length<needed||relevant.some((h,i)=>i&&h.at-relevant[i-1].at!==H)) add('unknown','forecast_gap','Hourly forecast does not cover every required hour; cannot verify full screening window.');
 if(!paint.subgrades.includes(surface)) add(paint.excludes.includes(surface)?'conflict':'unknown','surface',`Manufacturer-supported use of ${paint.name} on ${surfaces[surface]} is ${paint.excludes.includes(surface)?'excluded':'not established by this limited catalogue'}.`);
 else add('unknown','surface_check','Surface compatibility depends on existing coating, moisture, preparation and primers; verify on site.');
 for(const h of relevant){
   const applying=h.at<appliedUntil;
   const phase=applying?'application':'drying screening';
   const min=applying?paint.min:paint.dryingMin,max=applying?paint.max:paint.dryingMax;
   if(!Number.isFinite(h.temp))add('unknown','temp_missing','Missing hourly forecast temperature.',h.at,phase);
   else{
     if(min!==null&&h.temp<min)add('conflict','temp_low',`${h.temp.toFixed(1)}°C forecast air temperature is below documented ${min}°C limit.`,h.at,phase);
     if(max!==null&&h.temp>max)add('conflict','temp_high',`${h.temp.toFixed(1)}°C forecast air temperature exceeds documented ${max}°C limit.`,h.at,phase);
     if(min===null||max===null)add('unknown','temp_limit_missing','Manufacturer maximum/minimum air temperature limit is not both documented.',h.at,phase);
   }
   if(h.precip===null){
     add('unknown','rain_missing','Rain forecast is missing for this period.',h.at,phase);
   } else if(h.precip>0.05){
     if(applying){
       add('conflict','rain_during_work',`${h.precip.toFixed(1)} mm forecast rain during painting. Do not apply on a wet or raining wall.`,h.at,phase);
     }else if(paint.rainProtectionHours!==null && h.at<rainProtectionEnd){
       add('caution','rain_before_protection',`${h.precip.toFixed(1)} mm rain forecast before the documented early shower-resistance interval ends.`,h.at,phase);
     }else if(paint.rainProtectionHours===null){
       add('caution','rain_unverified',`${h.precip.toFixed(1)} mm rain during drying; no verified early rain-protection time for this paint.`,h.at,phase);
     }else{
       add('caution','rain_later',`${h.precip.toFixed(1)} mm rain later in the screening period. Early shower resistance does not prove safety in prolonged or heavy rain.`,h.at,phase);
     }
   }
   if(applying&&Number.isFinite(h.precipProbability)&&h.precipProbability>=60){
     add('caution','rain_chance',`${Math.round(h.precipProbability)}% model probability of precipitation during work; consider protecting or rescheduling.`,h.at,phase);
   }
 }
 // Mandatory distinctions: manufacturer never gave rain resistance duration; hourly humidity/wind are informational only.
 if(paint.rainProtectionHours===null)add('unknown','rain_unknown','Early rain-protection time is not documented. Recoating time is not rain resistance.');
 else add('unknown','rain_scope',`Manufacturer documents approx. ${Math.round(paint.rainProtectionHours*60)} minutes of ${paint.rainProtectionKind||'early rain'} resistance. Hourly forecast cannot verify individual-minute shower onset, prolonged rain or wall wetness.`);
 if(paint.referenceHours===null)add('unknown','dry_unknown','Full drying duration is not documented. Only the minimum reference recoating checkpoint was screened.');
 else add('unknown','dry_reference',`${paint.referenceHours} h is an approximate full-cure reference at 20°C/65% RH, not a validated curing prediction for this forecast.`);
 add('unknown','substrate_temp','Forecast air temperature is not measured wall/substrate temperature. Check substrate temperature and dew point on site.');
 add('unknown','qualitative','Evaluate wind, sun exposure, high humidity, dew, substrate moisture, coating condition and system-specific primer on site.');
 const conflicts=findings.filter(x=>x.status==='conflict');
 const cautions=findings.filter(x=>x.status==='caution');
 const duringWork=relevant.filter(h=>h.at<appliedUntil);
 const earlyRainRisk=relevant.some(h=>h.at>=appliedUntil && h.at<rainProtectionEnd && h.precip>0.05);
 const wetWork=duringWork.some(h=>h.precip>0.05);
 const rainInScreen=relevant.some(h=>h.precip>0.05);
 const maxRainChance=Math.max(0,...duringWork.map(h=>Number.isFinite(h.precipProbability)?h.precipProbability:0));
 return {rain:{wetWork,earlyRainRisk,rainInScreen,maxChanceDuringWork:maxRainChance,earlyProtectionMinutes:paint.rainProtectionHours===null?null:Math.round(paint.rainProtectionHours*60),protectionKind:paint.rainProtectionKind||null},paint:{id:paint.id,brand:paint.brand,name:paint.name,source:paint.source,version:paint.sourceVersion,market:paint.market||null,rainProtectionHours:paint.rainProtectionHours??null,rainProtectionKind:paint.rainProtectionKind||null,temp:{min:paint.min,max:paint.max,dryingMin:paint.dryingMin,dryingMax:paint.dryingMax},reference:{hours:paint.referenceHours,recoatHours:paint.recoatHours,kind:paint.referenceKind},evidence:paint.evidence,prep:paint.prep},status:conflicts.length?'conflict':'conditional',conflicts, cautions, unknown, hours:relevant.map(h=>({...h,phase:h.at<appliedUntil?'application':'drying screening',label:isoLocal(h.at,forecast.timezone)})),startUtc:new Date(start).toISOString(),endUtc:new Date(until).toISOString(),screeningHours,coverageComplete:!unknown.some(x=>x.code==='forecast_gap')};
}
export function evaluateJob(job,forecast){
 const selected=job.paintId==='uploaded'?job.uploadedPaint:byId(job.paintId);
 if(!selected)throw new Error('Paint product not found');
 const main=assess(selected,job,forecast);
 let alternatives=[];
 if(main.conflicts.length){
   alternatives=catalogue.filter(x=>x.id!==selected.id&&x.subgrades.includes(job.surface)).map(p=>assess(p,job,forecast)).filter(r=>r.conflicts.length===0&&r.coverageComplete&&!r.rain.wetWork).sort((a,b)=>Number(b.paint.rainProtectionHours!==null)-Number(a.paint.rainProtectionHours!==null)||a.unknown.length-b.unknown.length).slice(0,4).map(r=>({...r,reason:`Documented application-temperature candidate for ${surfaces[job.surface]}; verify wall, drying and ${r.paint.market?'availability in Germany':'primer/system'} before use.`}));
 }
 return {selected:main,alternatives,forecast:{location:forecast.location,timezone:forecast.timezone,fetchedAt:forecast.fetchedAt,provider:'Open-Meteo',count:forecast.hours.length},disclaimer:'Screening only — not a guarantee of application, drying or substrate suitability. Professional assessment and the current original datasheet remain essential.'};
}
