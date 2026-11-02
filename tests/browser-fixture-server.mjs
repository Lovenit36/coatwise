// TEST-ONLY SERVER. Never deploy this file: weather values below are synthetic test fixtures.
import {createServer} from 'node:http';
process.env.NODE_ENV='test';
const {handler}=await import('../server.mjs');
const today=Math.floor(Date.now()/86400000)*86400;
global.fetch=async url=>{
 if(String(url).includes('geocoding-api'))return {ok:true,json:async()=>({results:[{name:'Berlin',country_code:'DE',latitude:52.52,longitude:13.41,timezone:'Europe/Berlin'}]})};
 if(String(url).includes('/forecast')){
  const time=Array.from({length:384},(_,i)=>today+i*3600);
  return {ok:true,json:async()=>({timezone:'Europe/Berlin',hourly:{time,temperature_2m:time.map((_,i)=>{const t=i%24;return (t>=3&&t<=7)?4.5:6.5;}),relative_humidity_2m:time.map(()=>70),precipitation:time.map((_,i)=>i%29===0?0.6:0),precipitation_probability:time.map(()=>30),wind_speed_10m:time.map(()=>7)}})};
 }
 throw Error('Unexpected external API call: '+url);
};
createServer(handler).listen(Number(process.env.TEST_PORT||3001),'127.0.0.1',()=>console.log('TEST fixture server on '+(process.env.TEST_PORT||3001)));
