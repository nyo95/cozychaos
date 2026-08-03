import { applyResolveOutcome, buildRuneBody, composeStroke, createMatch,
  createTurnEnvironment, runResolve, spawnPosition, startNextTurn } from '../shared/dist/index.js';
function line(len){const p=[];for(let i=0;i<40;i++){const t=i/39;p.push({x:-0.3+t*len,y:0.3});}return p;}
function mkRune(s,pos,aim,len){const pts=line(len);const r=composeStroke(pts).recipe;
  return buildRuneBody({points:pts,owner:s,casterPosition:pos,castDirection:aim,inkCommitted:r.inkCommitted,inkReserved:r.inkReserved});}
const a0={x:1,y:0.35},a1={x:-1,y:0.35};
function play(seed,l0,l1,cap){let st=createMatch(seed),pos=[spawnPosition(0),spawnPosition(1)],wob=[0,0],t=0;
 while(st.winner===null&&t<cap){const e=createTurnEnvironment(st.seed,st.round);
  const r=runResolve({positions:pos,wobble:wob,runes:[mkRune(0,pos[0],a0,l0),mkRune(1,pos[1],a1,l1)],wind:e.wind,obstacles:e.obstacles});t++;
  if(r.knockouts.length>0){st=applyResolveOutcome(st,{knockouts:[...r.knockouts]});pos=[spawnPosition(0),spawnPosition(1)];wob=[0,0];}
  else{st=startNextTurn(st);pos=[r.endPositions[0],r.endPositions[1]];wob=[r.endWobble[0],r.endWobble[1]];}}
 return {t,w:st.winner};}
for (const [lab,l0,l1] of [['both max wall (2.5)',2.5,2.5],['dart 0.35 vs wall 2.5',0.35,2.5]]){
 let stall=0,tt=0,w0=0,w1=0;
 for(let s=1;s<=20;s++){const m=play(s,l0,l1,30); if(m.w===null)stall++; else {tt+=m.t; m.w===0?w0++:w1++;}}
 console.log(`${lab.padEnd(24)} stalled=${stall}/20 avgTurns=${(20-stall)?(tt/(20-stall)).toFixed(1):'-'} wins slot0/slot1=${w0}/${w1}`);}
