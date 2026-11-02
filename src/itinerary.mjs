// Editable, forecast-aware work plan. Coating counts, labor and prep are user's choices;
// recoat time is a reference checkpoint, NEVER a guarantee of dryness.
import {assess} from './engine.mjs';
import {byId} from './catalogue.mjs';
import {localToUTC} from './time.mjs';
const H=3600000, DAY=86400000;
function isoDate(iso,n){return new Date(Date.parse(iso+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);}
const pad=n=>String(n).padStart(2,'0');
function clock(hour){return `${pad(Math.floor(hour))}:${pad(Math.round((hour%1)*60))}`;}
function addHours(local,hrs,zone){const utc=localToUTC(local,zone)+hrs*H;return new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(utc)).replace(' ','T');}
export function parsePlanOptions(options={},job={}){
 const integer=(value,def,min,max)=>Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):def;
 const dimension=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=1000?Number(value):null;
 return {coats:integer(options.coats,1,1,4),dailyStart:integer(options.dailyStart,9,6,16),dailyHours:integer(options.dailyHours,8,2,12),workHoursPerCoat:integer(options.workHoursPerCoat,Math.max(1,Number(job.durationHours)||4),1,16),prepHours:integer(options.prepHours,2,0,12),daysAvailable:options.daysAvailable==null||options.daysAvailable===''?null:integer(options.daysAvailable,null,1,15),primer:options.primer==='yes'?'yes':options.primer==='no'?'no':'unknown',primerWaitHours:integer(options.primerWaitHours,12,0,120),wallWidthM:dimension(options.wallWidthM),wallHeightM:dimension(options.wallHeightM)};
}
export function buildWorkItinerary(job,paint,forecast,options={}, {now=Date.now()}={}){
 if(!paint)paint=job.paintId==='uploaded'?job.uploadedPaint:byId(job.paintId);
 if(!paint)throw Error('Choose a manufacturer product before planning.');
 const opts=parsePlanOptions(options,job),zone=forecast.timezone, steps=[],warnings=[],firstDate=job.dateTime.slice(0,10);
 if(opts.dailyStart+opts.dailyHours>23)throw Error("Daily work hours extend beyond 23:00. Choose an earlier start or fewer hours; overnight work needs a separate verified schedule.");
 const firstWorkDay=job.dateTime.slice(0,10),firstClock=Number(job.dateTime.slice(11,13))+Number(job.dateTime.slice(14,16))/60;
 const firstHour=Math.max(firstClock,opts.dailyStart);
 const recoat=paint.recoatHours;
 let dateIndex=0,remainingPrep=opts.prepHours,previousCoatEnd=null,halted=false;
 const push=(item)=>steps.push({...item,id:`step-${steps.length+1}`});
 const maxDayIndex=(opts.daysAvailable||15)-1;const last=forecast.hours.at(-1)?.at||0;
 let scheduledCoats=0;
 for(let day=0;day<=maxDayIndex&&scheduledCoats<opts.coats&&!halted;day++){
  dateIndex=day;const date=isoDate(firstDate,day),dayStart=day===0?firstHour:opts.dailyStart,dayEnd=opts.dailyStart+opts.dailyHours;
  let cursor=dayStart;if(cursor>=dayEnd)continue;
  if(remainingPrep){const hours=Math.min(remainingPrep,dayEnd-cursor);push({date,start:clock(cursor),end:clock(cursor+hours),type:'preparation',title:'Inspect, clean and prepare the facade',status:'site-check',details:'Check substrate moisture, old coating adhesion, repairs, access and primer instructions before painting.'});cursor+=hours;remainingPrep-=hours;if(remainingPrep>0)continue;}
  if(opts.primer==='yes'&&!steps.some(x=>x.type==='primer')){
   push({date,start:clock(cursor),end:clock(Math.min(dayEnd,cursor+1)),type:'primer',title:'Primer / base coat — confirm exact product',status:'unverified',details:'Primer product, number of passes and drying time are NOT manufacturer verified. This is a planning placeholder, not an instruction to apply.'});
   cursor=Math.min(dayEnd,cursor+1);previousCoatEnd=addHours(`${date}T${clock(cursor)}`,opts.primerWaitHours,zone);
   warnings.push('Primer drying interval is your estimate, not a verified manufacturer requirement. Confirm primer sheet before following this schedule.');
  }
  if(cursor>=dayEnd)continue;
  while(scheduledCoats<opts.coats){
   const remaining=dayEnd-cursor;if(remaining<opts.workHoursPerCoat)break;
   const proposed=`${date}T${clock(cursor)}`;
   if(previousCoatEnd&&proposed<previousCoatEnd){let eligible;
    try{eligible=localToUTC(previousCoatEnd,zone);}catch{eligible=Infinity;}
    const earliest=localToUTC(proposed,zone);if(eligible>=localToUTC(`${date}T${clock(dayEnd)}`,zone))break;
    cursor+=Math.ceil((eligible-earliest)/H);if(cursor+opts.workHoursPerCoat>dayEnd)break;
   }
   const slot=`${date}T${clock(cursor)}`;
   const ends=addHours(slot,opts.workHoursPerCoat,zone);
   const endUtc=localToUTC(slot,zone)+opts.workHoursPerCoat*H;
   if(localToUTC(slot,zone)<now){push({date,start:clock(cursor),end:clock(cursor+opts.workHoursPerCoat),type:'coat',coat:scheduledCoats+1,title:`Coat ${scheduledCoats+1}: reserved slot is in the past`,status:'blocked',details:'Reschedule to a future start.'});halted=true;break;}
   if(endUtc+(paint.recoatHours??0)*H>last+H){push({date,start:clock(cursor),end:clock(cursor+opts.workHoursPerCoat),type:'coat',coat:scheduledCoats+1,title:`Coat ${scheduledCoats+1}: forecast unavailable`,status:'unverified',details:'Not enough weather forecast to assess this coating/drying window.'});halted=true;break;}
   let assessment;try{assessment=assess(paint,{...job,dateTime:slot,durationHours:opts.workHoursPerCoat},forecast);}catch(e){warnings.push(e.message);halted=true;break;}
   const workIssues=assessment.conflicts.filter(x=>x.phase==='application');
   const dryingIssues=assessment.conflicts.filter(x=>x.phase==='drying screening');
   const blocked=assessment.conflicts.length>0||!assessment.coverageComplete;
   const explanation=workIssues.length?`Application conflict: ${workIssues[0].message}`:dryingIssues.length?`Drying-window conflict: ${dryingIssues[0].message}`:assessment.cautions.length?`Weather caution: ${assessment.cautions[0].message}`:'No documented air-temperature/rain breach in forecast; check the wall, dew and product instructions.';
   push({date,start:clock(cursor),end:clock(cursor+opts.workHoursPerCoat),type:'coat',coat:scheduledCoats+1,title:`Apply coat ${scheduledCoats+1} of ${paint.brand} ${paint.name}`,status:blocked?'blocked':'conditional',details:explanation,source:paint.source,applicationIssues:workIssues.length,dryingIssues:dryingIssues.length});
   if(blocked){warnings.push(`Coat ${scheduledCoats+1} ${date} ${clock(cursor)}: ${explanation} — trying the next workday if available.`);break;}
   scheduledCoats++;
   if(scheduledCoats>=opts.coats)break;
   if(!Number.isFinite(recoat)){
    warnings.push('Manufacturer recoating interval is not documented. Subsequent coats cannot be scheduled automatically.');halted=true;break;
   }
   previousCoatEnd=addHours(ends,recoat,zone);
   // Keep the approximate recoating checkpoint separate from the actual drying determination.
   push({date,start:clock(cursor+opts.workHoursPerCoat),end:null,type:'wait',title:`Wait at least ${recoat}h reference before next coat`,status:'unverified',details:'Manufacturer time is a reference under stated conditions. Cold/damp weather may extend drying; assess actual dryness before recoating.'});
   cursor+=opts.workHoursPerCoat;
  }
 }
 const actualDays=[...new Set(steps.map(s=>s.date))];
 if(scheduledCoats<opts.coats)warnings.push(`Only ${scheduledCoats} of ${opts.coats} coat slots could be placed within the available plan. Adjust working hours or dates.`);
 if(opts.daysAvailable&&scheduledCoats<opts.coats)warnings.push(`The requested ${opts.daysAvailable}-day availability is insufficient for the screened schedule or has blocked slots.`);
 if(opts.primer==='unknown')warnings.push('Primer need and system compatibility have not been verified. Read the manufacturer preparation instructions.');
 if(paint.market)warnings.push(paint.market);
 if(paint.referenceHours===null)warnings.push('Full curing duration is not established by the available source.');
 else warnings.push(`${paint.referenceHours}h full curing is only a reference at manufacturer test conditions; actual weather may extend it.`);
 return {title:`Custom plan for ${paint.brand} ${paint.name}`,paint:`${paint.brand} ${paint.name}`,source:paint.source,location:forecast.location,generatedAt:forecast.fetchedAt,options:opts,days:actualDays.map(date=>({date,steps:steps.filter(s=>s.date===date)})),plannedCoats:scheduledCoats,requestedCoats:opts.coats,dayCount:actualDays.length,areaM2:opts.wallWidthM&&opts.wallHeightM?Number((opts.wallWidthM*opts.wallHeightM).toFixed(2)):null,hasBlocks:steps.some(x=>x.status==='blocked'),complete:scheduledCoats===opts.coats&&!halted,warnings:[...new Set(warnings)],note:'Planning aid, not permission to paint. Confirm real substrate temperature, dew point, preparation, primer and drying at the job.'};
}
// Only explicitly requested plans generate a schedule. A question such as "how many coats?"
// must be answered from manufacturer evidence, not a default two-coat itinerary.
export function itineraryRequest(question){
 const q=String(question||'');
 return /\bitinerar(?:y|ies)\b|\b(?:painting|coating|work|day.by.day|multi.day|multiple.days|daily)\s+(?:plan|schedule)\b|\b(?:give|create|make|build|draft|prepare|generate|show)\b[^.!?]{0,100}\b(?:plan|schedule)\b|\b(?:plan|schedule|organis[ez])\s+(?:out\s+)?(?:my|our|the|this|a)\s+(?:job|work|coats|painting|coating)\b/i.test(q);
}

// Parse explicit natural-language customization without inventing unspecified requirements.
export function readPlanRequest(question,settings={},job={}){
 const q=String(question||'').toLowerCase();const result={...settings};
 const nums={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
 const value=t=>nums[t]??Number(t);
 const count=q.match(/\b(\d+|one|two|three|four)\s*(?:coats?|layers?)\b/);
 if(count&&value(count[1])>=1&&value(count[1])<=4)result.coats=value(count[1]);
 const labor=q.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:h|hrs?|hours?)\s*(?:per|for each|each)\s*(?:coat|layer)\b/);
 if(labor&&value(labor[1])>=1&&value(labor[1])<=16)result.workHoursPerCoat=value(labor[1]);
 const daily=q.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:h|hrs?|hours?)\s*(?:per|each|a)\s*(?:day|workday)\b/);
 if(daily&&value(daily[1])>=2&&value(daily[1])<=12)result.dailyHours=value(daily[1]);
 const days=q.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:working\s+)?days?\s*(?:available|to finish|for the job|for painting|to paint)?\b/);
 if(days&&value(days[1])>=1&&value(days[1])<=15)result.daysAvailable=value(days[1]);
 // An explicit '5th till 6th' window is a two-day request, not a 15-day search.
 const span=q.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|till|until|through|-)\s*(\d{1,2})(?:st|nd|rd|th)?\b/);
 if(span&&job.dateTime&&Number(span[1])===Number(job.dateTime.slice(8,10))&&Number(span[2])>=Number(span[1])&&Number(span[2])-Number(span[1])<15)result.daysAvailable=Number(span[2])-Number(span[1])+1;
 const dimensions=q.match(/\b(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\s*(?:wide|width)?\s*(?:[x×]|by)\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?\b/);
 if(dimensions){result.wallWidthM=Number(dimensions[1]);result.wallHeightM=Number(dimensions[2]);}
 const named=q.match(/\bwidth\s*(?:is|:|=)?\s*(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?[^.!?]{0,60}\bheight\s*(?:is|:|=)?\s*(\d+(?:\.\d+)?)/);
 if(named){result.wallWidthM=Number(named[1]);result.wallHeightM=Number(named[2]);}
 const prep=q.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:h|hrs?|hours?)\s*(?:of|for)?\s*prep(?:aration)?\b/);
 if(prep&&value(prep[1])>=0&&value(prep[1])<=12)result.prepHours=value(prep[1]);
 return parsePlanOptions(result,job);
}
