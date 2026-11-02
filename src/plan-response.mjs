import {catalogue} from './catalogue.mjs';

// Only switch the proposed plan's paint on an explicit user choice; never silently
// keep planning the previously assessed paint when the user says "I'll use Sandtex".
export function requestedPlanPaint(question, currentPaintId){
 const q=String(question||'').toLowerCase();
 if(!/\b(?:i(?:'ll| will)? (?:use|go with)|let'?s (?:use|go with)|switch(?:ing)? to|instead (?:use|with)|go with|use the|using|(?:plan|itinerar(?:y|ies)|schedule) for|for the new paint)\b/.test(q))return null;
 const matches=catalogue.filter(p=>{
  const full=`${p.brand} ${p.name}`.toLowerCase();
  const brand=p.brand.toLowerCase();
  const firstName=p.name.toLowerCase().split(/\s+/)[0];
  const firstNameUnique=catalogue.filter(x=>x.name.toLowerCase().startsWith(firstName)).length===1 && firstName.length>=5 && new RegExp(`\\b${firstName}\\b`,'i').test(q);
  const direct=q.includes(full)||q.includes(p.name.toLowerCase())||firstNameUnique;
  const uniqueBrand=catalogue.filter(x=>x.brand.toLowerCase()===brand).length===1&&new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(q);
  return direct||uniqueBrand||(p.id==='sandtex365'&&/\bsand(?:tex|tax)\b|\b365 all.weather\b/.test(q));
 });
 return matches.length===1&&matches[0].id!==currentPaintId?matches[0]:null;
}
export function hasWallDimensions(text){
 const q=String(text||'');
 return /\b\d+(?:\.\d+)?\s*(?:m|metres?|meters?)?\s*(?:[x×]|by)\s*\d+(?:\.\d+)?\s*(?:m|metres?|meters?)?\b/i.test(q) || /\bwidth\s*(?:is|:|=)?\s*\d+(?:\.\d+)?\s*(?:m|metres?|meters?)?[^.!?]{0,60}\bheight\s*(?:is|:|=)?\s*\d+(?:\.\d+)?/i.test(q);
}
const compactDate=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short'});
const stepsOf=plan=>plan.days.flatMap(d=>d.steps);
export function planReply(plan,paint){
 const steps=stepsOf(plan);
 const firstProblem=steps.find(s=>s.type==='coat'&&s.status==='blocked');
 const d0=plan.days[0]?.date;
 const requestedDays=plan.options.daysAvailable||15;
 const period=d0?`${compactDate(d0)}${requestedDays>1?' onwards':''}`:'your requested dates';
 const name=plan.paint;
 const dimension=plan.areaM2!==null
  ?`Wall: ${plan.areaM2} m² (gross area; subtract windows/doors). Paint quantity still needs documented coverage and confirmed coats.`
  :'What are the wall’s width and height in metres? I can calculate its area, then refine the plan using verified paint coverage.';
 if(!plan.complete){
  const reason=firstProblem?firstProblem.details.replace(/^(?:Application conflict|Drying-window conflict|Weather caution):\s*/,''):
    steps.some(s=>s.type==='coat'&&s.status==='unverified')?'Forecast or drying data does not cover the full job.':
    `Only ${plan.plannedCoats}/${plan.requestedCoats} planned coats fit the verified forecast and available work hours.`;
  return `No verified ${plan.requestedCoats}-coat itinerary for ${name} (${period}). ${reason}\nSee “Weather & verdict by date” below. ${dimension}`;
 }
 const coatSteps=steps.filter(s=>s.type==='coat'&&s.status==='conditional');
 const prep=steps.find(s=>s.type==='preparation');
 const lines=[`Provisional ${name} plan — weather-screened, not site-approved.`];
 if(prep)lines.push(`Prep: ${compactDate(prep.date)}, ${prep.start}–${prep.end}: inspect, clean and prepare wall.`);
 for(const s of coatSteps)lines.push(`Coat ${s.coat}: ${compactDate(s.date)}, ${s.start}–${s.end}.`);
 lines.push(Number.isFinite(paint.recoatHours)?`${plan.requestedCoats===1?'If another coat is required':'Recoat checkpoint'}: at least ${paint.recoatHours} h at manufacturer reference conditions; confirm dry before recoating.`:'If another coat is required, the recoating interval is not verified.');
 lines.push(paint.referenceHours!==null?`Full cure: ~${paint.referenceHours} h reference at manufacturer test conditions, possibly longer in cold/damp weather.`:'Full cure time: not documented in the verified source.');
 lines.push(`Coat count is your plan, not confirmed necessary by this datasheet. ${dimension}`);
 return lines.join('\n');
}
export function compactPlanSteps(plan){
 // Remove repetitive blocked alternatives from the summary card; keep the first
 // actual plan day and all conditionally placed steps. Full diagnostics remain in
 // the separate on-demand weather breakdown.
 return plan.days.map(day=>({...day,steps:day.steps.filter(s=>s.type!=='coat'||s.status==='conditional')})).filter(day=>day.steps.some(s=>s.type==='coat'&&s.status==='conditional'||s.type==='preparation'||s.type==='primer'));
}
