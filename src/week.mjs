// A seven-day question must trigger a NEW 16-day live forecast, not reuse a shortened signed report.
// All dates are interpreted in the German job timezone and use the same manufacturer rule engine.
import {assess} from './engine.mjs';
import {byId,catalogue} from './catalogue.mjs';
import {localToUTC} from './time.mjs';
const DAY=86400000, HOUR=3600000;
const addDays=(iso,n)=>new Date(Date.parse(`${iso}T12:00:00Z`)+n*DAY).toISOString().slice(0,10);
const format=(iso)=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
export function scheduleRequest(question,job){
 const q=question.toLowerCase();
 const hasWeek=/\bweek\b|\b7\s*days\b|\bseven\s+days\b|\bnext\s+7\b/.test(q);
 const hasDate=/\b(after|from|starting|since|following)\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\b/.test(q);
 if(!hasWeek&&!(/\b(after|from)\b/.test(q)&&/\b\d{1,2}(?:st|nd|rd|th)\b/.test(q)))return null;
 if(!job?.dateTime||!/\d{4}-\d\d-\d\dT\d\d:\d\d/.test(job.dateTime))return null;
 const reference=job.dateTime.slice(0,10);
 let start;
 const specific=q.match(/\b(?:after|from|starting|since|following)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+(november|december|january|february|march|april|may|june|july|august|september|october))?\b/);
 if(specific){
  const day=Number(specific[1]);let month=Number(reference.slice(5,7));let year=Number(reference.slice(0,4));
  if(specific[2])month=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(specific[2])+1;
  const base=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if(new Date(`${base}T12:00:00Z`).toISOString().slice(0,10)!==base)return null;
  start=addDays(base,q.includes('after')||q.includes('following')?1:0);
 }else if(/\bnext week\b/.test(q)){
  const d=new Date(reference+'T12:00:00Z');const weekday=(d.getUTCDay()+6)%7;
  start=addDays(reference,7-weekday);
 }else if(hasWeek)start=addDays(reference,1);
 else return null;
 return {start,end:addDays(start,6),count:7,requestedHour:job.dateTime.slice(11,16)};
}
// Recognise a month request before the ordinary chat model sees it.
// A calendar month can be longer than the API horizon: unavailable days are explicitly recorded.
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
export function monthRequest(question,job,{now=Date.now()}={}){
 if(typeof question!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(job?.dateTime||''))return null;
 const q=question.toLowerCase();
 const hasIntent=/\b(check|best|suitab\w*|good|dates?|days?|weather|forecast|window|plan|paint|work|when|possible)\b/.test(q);
 const mentionsMonth=/\b(this|current|whole|entire|rest of|remaining|next)\s+month\b|\bmonth of\b|\bmonth\b/.test(q);
 const explicit=q.match(/\b(january|jan\.?|february|feb\.?|march|mar\.?|april|apr\.?|may|june|jun\.?|july|jul\.?|august|aug\.?|september|sep\.?|sept\.?|october|oct\.?|november|nov\.?|december|dec\.?)(?:\s+(20\d{2}))?\b/);
 if(!hasIntent||(!mentionsMonth&&!explicit))return null;
 // Avoid confusing a product name mentioning a month with a scheduling request.
 const berlin=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit'}).formatToParts(new Date(now));
 const yearNow=Number(berlin.find(x=>x.type==='year').value),monthNow=Number(berlin.find(x=>x.type==='month').value);
 let month=monthNow,year=yearNow;
 if(explicit){const word=explicit[1].replace('.','');month=MONTHS.findIndex(name=>name===word||name.startsWith(word.slice(0,3)))+1;
  if(explicit[2])year=Number(explicit[2]);
  else if(month<monthNow&&(/\bnext\b|\bcoming\b/.test(q)))year++;
 } else if(/\bnext month\b/.test(q)){month++;if(month===13){month=1;year++;}}
 if(month<1||month>12)return null;
 const start=`${year}-${String(month).padStart(2,'0')}-01`;
 const days=new Date(Date.UTC(year,month,0)).getUTCDate();
 return {kind:'month',start,end:addDays(start,days-1),count:days,requestedHour:job.dateTime.slice(11,16),monthLabel:`${MONTHS[month-1][0].toUpperCase()+MONTHS[month-1].slice(1)} ${year}`};
}
export function screenWeek(job,forecast,request,{now=Date.now(),includeAlternatives=true}={}){
 const paint=job.paintId==='uploaded'?job.uploadedPaint:byId(job.paintId);
 if(!paint)throw new Error('Select a paint and run a new assessment to check the week.');
 const rows=[];
 const desiredHour=Number(request.requestedHour.slice(0,2));
 const candidateHours=[desiredHour,9,10,11,12,13,14].filter((h,i,all)=>h>=8&&h<=14&&all.indexOf(h)===i);
 const screeningHours=Number(job.durationHours)+Math.max(paint.referenceHours??paint.recoatHours??0,paint.rainProtectionHours??0);
 const last=forecast.hours.at(-1)?.at;
 for(let i=0;i<Math.min(31,Math.max(1,Number(request.count)||7));i++){
  const day=addDays(request.start,i);let best=null;
  for(const hour of candidateHours){
   const clock=`${String(hour).padStart(2,'0')}:${request.requestedHour.slice(3)}`;
   const dateTime=`${day}T${clock}`;
   let utc;try{utc=localToUTC(dateTime,forecast.timezone);}catch{continue;}
   if(utc<now){best={date:day,label:format(day),status:'past',reason:'Date has passed'};continue;}
   if(!last||utc+screeningHours*HOUR>last+HOUR){if(!best)best={date:day,label:format(day),status:'outside',reason:'Beyond available forecast'};continue;}
   const a=assess(paint,{...job,dateTime},forecast);
   const applied=a.hours.filter(x=>x.phase==='application');
   const temps=applied.map(x=>x.temp).filter(Number.isFinite);
   const wet=applied.some(x=>x.precip===null||x.precip>0.05);
   const rainInScreening=a.hours.some(x=>x.precip===null||x.precip>0.05);
   const highRainChance=applied.some(x=>Number.isFinite(x.precipProbability)&&x.precipProbability>=60);
   const incompleteConditions=a.unknown.some(x=>['forecast_gap','temp_missing','temp_limit_missing'].includes(x.code));
   const duringWorkConflicts=a.conflicts.filter(c=>c.phase==='application');
   const dryingConflicts=a.conflicts.filter(c=>c.phase==='drying screening');
   const temperatureConflict=a.conflicts.some(c=>c.code==='temp_low'||c.code==='temp_high');
   const phase='application';
   const status=!a.coverageComplete||temps.length<Number(job.durationHours)||incompleteConditions?'unknown':a.conflicts.length?'avoid':rainInScreening||highRainChance?'rain':'possible';
   const screeningTemps=a.hours.filter(x=>x.phase==='drying screening').map(x=>x.temp).filter(Number.isFinite);
   const afterMin=screeningTemps.length?Math.min(...screeningTemps):null;
   const firstDrying= dryingConflicts.find(c=>c.code==='temp_low'||c.code==='temp_high');
   const firstWork=duringWorkConflicts.find(c=>c.code==='temp_low'||c.code==='temp_high');
   const badRain=duringWorkConflicts.find(c=>c.code==='rain_during_work');
   const reason=status==='unknown'?'Incomplete forecast or manufacturer limits':firstWork?`During painting: ${firstWork.message}`:
     badRain?`Rain forecast during application`:firstDrying?`After painting: ${firstDrying.message}`:
     a.conflicts.length?`Product/site conflict: ${a.conflicts[0].message}`:
     status==='rain'?(highRainChance?'Rain probability high during painting':'Rain risk in drying-screening period'):
     'Application and screened drying period have no documented breach';
   const screenedTemps=a.hours.map(x=>x.temp).filter(Number.isFinite);
   const margin=screenedTemps.length&&Number.isFinite(paint.min)?Math.min(...screenedTemps)-paint.min:null;
   const current={date:day,label:format(day),dateTime,status,reason,workTempMin:temps.length?Math.min(...temps):null,workTempMax:temps.length?Math.max(...temps):null,dryingTempMin:afterMin,requiredDryingMin:paint.dryingMin,temperatureConflict,applicationConflict:duringWorkConflicts.length>0,dryingConflict:dryingConflicts.length>0,firstBreachAt:(firstWork||firstDrying||badRain)?.at??null,rainDuringWork:wet,margin};
   // Prefer a passing slot, otherwise a rain-risk slot, then a documented temperature conflict.
   const rank={possible:4,rain:3,unknown:2,avoid:1,outside:0,past:-1};
   if(!best||rank[current.status]>rank[best.status]||(rank[current.status]===rank[best.status]&&current.status==='possible'&&(current.margin??-Infinity)>(best.margin??-Infinity)))best=current;
  }
  rows.push(best||{date:day,label:format(day),status:'unknown',reason:'Unable to compare hourly forecast'});
 }
 const possible=rows.filter(r=>r.status==='possible');
 const fullyChecked=rows.filter(r=>!['outside','past','unknown'].includes(r.status));
 const title=possible.length?`${possible.length} potential ${possible.length===1?'date':'dates'} to consider`:`No weather window passed in ${fullyChecked.length} checked days`;
 const note='Temperature shown beside each date is during painting only. A date may be rejected because the temperature later drops below the manufacturer drying-phase minimum. Checked starts 09:00–14:00; the full reference drying window is only a screening assumption, not a real-time cure measurement. Recoat times can be longer in cold or damp weather; verify substrate and drying on site.';
 const alternatives=includeAlternatives&&!possible.length?catalogue.filter(p=>p.id!==paint.id&&p.subgrades.includes(job.surface)).sort((a,b)=>(a.min??99)-(b.min??99)).slice(0,4).map(p=>({paint:p,week:screenWeek({...job,paintId:p.id},forecast,request,{now,includeAlternatives:false})})).filter(x=>x.week.possibleCount>0).sort((a,b)=>b.week.possibleCount-a.week.possibleCount).map(x=>({name:`${x.paint.brand} ${x.paint.name}`,source:x.paint.source,possibleDays:x.week.possibleCount,firstDay:x.week.rows.find(r=>r.status==='possible')?.label})).slice(0,3):[];
 const productLeads=includeAlternatives&&paint.min!==null?catalogue
  .filter(p=>p.id!==paint.id&&p.subgrades.includes(job.surface)&&Number.isFinite(p.min)&&p.min<paint.min&&p.rainProtectionHours!==null)
  .sort((a,b)=>a.min-b.min).slice(0,3)
  .map(p=>({name:`${p.brand} ${p.name}`,min:p.min,source:p.source,showerproofMinutes:Math.round(p.rainProtectionHours*60),market:p.market,note:'Published temperature/shower-resistance evidence only. Application, drying, surface and availability are NOT approved for this particular job.'})):[];
 const winterOption=includeAlternatives&&paint.id==='muresko'?{name:'Caparol Muresko + Trocknungsbeschleuniger',source:'https://www.caparol.de/en/product-range/paints/supplementary-products/additiv-fuer-die-kuehle-jahreszeit/trocknungsbeschleuniger',note:'Caparol documents the additive for Muresko at +1 to +10°C air/substrate; actual wall conditions and complete system instructions still need checking.'}:null;
 const afterPlannedStart=possible.filter(r=>r.date>=job.dateTime.slice(0,10));
 const ranked=[...(afterPlannedStart.length?afterPlannedStart:possible)].sort((a,b)=>(b.margin??-Infinity)-(a.margin??-Infinity)||a.date.localeCompare(b.date));
 const unavailable=rows.filter(r=>r.status==='outside').length;
 const past=rows.filter(r=>r.status==='past').length;
 return {productLeads,kind:request.kind||'week',monthLabel:request.monthLabel||null,alternatives,winterOption,start:request.start,end:request.end,generatedAt:forecast.fetchedAt,timezone:forecast.timezone,location:forecast.location,paint:`${paint.brand} ${paint.name}`,title,note,rows,bestDates:ranked.slice(0,3),possibleCount:possible.length,checkedCount:fullyChecked.length,unavailableCount:unavailable,pastCount:past,complete:rows.every(r=>!['outside','unknown'].includes(r.status)),source:'Open-Meteo'};
}
