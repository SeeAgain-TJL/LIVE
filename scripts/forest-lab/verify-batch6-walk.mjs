import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';

const quality=process.env.PINE_QUALITY || 'low';
const scale=process.env.PINE_SCALE || '0.8';
assert.ok(['low','mid','high'].includes(quality));
const recording=process.argv.includes('--record');
const bankRoute=process.env.PINE_ROUTE==='memory-bank';
const current=!!process.env.PINE_EVIDENCE;
const folder=current ? `${process.env.PINE_EVIDENCE}/walk-${quality}${recording ? '-recorded':''}`:'artifacts-local/pine-batch6/walk';
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,
 ...(recording ? {recordVideo:{dir:folder,size:{width:1440,height:900}}}:{}),
});
const page=await context.newPage();
const result={browser:browser.version(),quality,scale,recording,route:bankRoute?'memory-bank-out-and-back':'timed-input',errors:[],legs:[]};
const read=()=>page.locator('canvas').evaluate(c=>({
 camera:JSON.parse(c.dataset.forestOriginMetrics).camera,
 direction:JSON.parse(c.dataset.forestOriginMetrics).direction,
 stream:JSON.parse(c.dataset.forestStreaming),
}));
await page.addInitScript(()=>{
 window.pineArchiveReads=[];
 for(const method of ['getItem','setItem','removeItem','clear']){
  const old=Storage.prototype[method];
  Storage.prototype[method]=function(...args){window.pineArchiveReads.push({method,key:args[0]});return old.apply(this,args);};
 }
 const open=indexedDB.open.bind(indexedDB);
 indexedDB.open=(...args)=>{window.pineArchiveReads.push({method:'indexedDB.open'});return open(...args);};
});
page.on('pageerror',e=>result.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)result.errors.push(r.status()+' '+r.url());});
try {
 const start=Date.now();
 await page.goto((process.env.FOREST_LAB_URL||'http://127.0.0.1:3197')+`/forest-runtime-lab?scale=${scale}&quality=${quality}`+(process.env.PINE_QUERY ? '&'+process.env.PINE_QUERY : ''),{waitUntil:'domcontentloaded'});
 const canvas=page.locator('canvas[data-forest-origin-ready=true][data-pine-landmarks=ready]');
 await canvas.waitFor({timeout:120000});
 if(process.env.PINE_VISUAL_FINISH) await page.locator('canvas[data-pine-outer-forest=ready]').waitFor({timeout:120000});
 result.firstReadyMs=Date.now()-start;
 result.display=await canvas.evaluate(c=>{
  const gl=c.getContext('webgl2');
  const debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {viewport:[c.clientWidth,c.clientHeight],internal:[c.width,c.height],
   renderer:gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};
 });
 await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('canvas').dataset.forestStreaming||'null');return s&&!s.pendingTiles.length&&!s.pendingResources.length&&!s.queued;},null,{timeout:120000});
 result.firstSettledMs=Date.now()-start;
 result.initial=await read();
 await canvas.click({position:{x:720,y:450}});
 const all=[];
 // The forest memory regression walks this dry, collision-checked bank.
 // Measure fixed endpoints rather than fixed elapsed input: slow rendering
 // changes travel speed, and a blocked leg must never count as a route pass.
 const target=[-33.66815764204932,-1.664436599196117];
 const spawn=[result.initial.camera[0],result.initial.camera[2]];
 const length=Math.hypot(target[0]-spawn[0],target[1]-spawn[1]);
 const axis=target.map((value,i)=>(value-spawn[i])/length);
 if(bankRoute) {
  const facing=Math.atan2(-result.initial.direction[0],-result.initial.direction[2]);
  const yaw=Math.atan2(-axis[0],-axis[1])-facing;
  const drag=Math.round(-Math.atan2(Math.sin(yaw),Math.cos(yaw))/.0025);
  await page.mouse.move(720,450);await page.mouse.down();
  await page.mouse.move(720+drag,450,{steps:12});await page.mouse.up();
 }
 const legs=bankRoute ? [['w',null,0],['s',null,0]] : current ? [['w',12000,405],['w',10500,405],['w',10500,250],['w',9000,0]]:[['w',16000,280],['d',12000,280],['s',14000,280]];
 let prior=result.initial.camera;
 for(const [key,ms,turn] of legs) {
  await page.evaluate(()=>{window.pineWalkFrames=[];window.pineWalkRunning=true;let last=performance.now();function tick(now){if(!window.pineWalkRunning)return;window.pineWalkFrames.push(now-last);last=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);});
  await page.keyboard.down(key);
  try {
   if(bankRoute) await page.waitForFunction(({spawn,axis,length,key})=>{
    const {camera}=JSON.parse(document.querySelector('canvas').dataset.forestOriginMetrics);
    const along=(camera[0]-spawn[0])*axis[0]+(camera[2]-spawn[1])*axis[1];
    return key==='w' ? along>=length-4 : along<=4;
   },{spawn,axis,length,key},{timeout:55000});
   else await page.waitForTimeout(ms);
  } finally {await page.keyboard.up(key);}
  const frames=await page.evaluate(()=>{window.pineWalkRunning=false;return window.pineWalkFrames;});
  all.push(...frames);
  frames.sort((a,b)=>a-b);
  const state=await read();
  if(bankRoute) {
   const endpoint=key==='w'?target:spawn;
   assert.ok(Math.hypot(state.camera[0]-endpoint[0],state.camera[2]-endpoint[1])<4.2);
   assert.ok(Math.hypot(state.camera[0]-prior[0],state.camera[2]-prior[2])>64);
  }
  result.legs.push({key,ms,fps:frames.length*1000/frames.reduce((a,b)=>a+b,0),p95Ms:frames[Math.floor(frames.length*.95)],
   displacement:Math.hypot(state.camera[0]-prior[0],state.camera[2]-prior[2]),...state});
  prior=state.camera;
  if(turn){await page.mouse.move(660,450);await page.mouse.down();await page.mouse.move(660+turn,450,{steps:20});await page.mouse.up();}
 }
 all.sort((a,b)=>a-b);
 result.combined={seconds:all.reduce((a,b)=>a+b,0)/1000,fps:all.length*1000/all.reduce((a,b)=>a+b,0),p95Ms:all[Math.floor(all.length*.95)]};
 if(recording && process.env.PINE_VISUAL_FINISH) {
  // Keep the 42 s benchmark route comparable across tiers. In the recorded
  // take, also demonstrate strafing and reversing on the actual input path.
  result.extraInputs=[];
  await page.mouse.move(720,420);await page.mouse.down();await page.mouse.move(606,467,{steps:19});await page.mouse.up();
  let prior=(await read()).camera;
  for(const key of ['a','s','d']) {
   await page.keyboard.down(key);await page.waitForTimeout(1400);await page.keyboard.up(key);
   const {camera}=await read();
   const displacement=Math.hypot(camera[0]-prior[0],camera[2]-prior[2]);
   result.extraInputs.push({key,camera,displacement});prior=camera;
  }
  assert.ok(result.extraInputs.every(input=>input.displacement>.35));
 }
 await page.waitForTimeout(9000);
 result.final=await read();
 result.contextLost=await canvas.evaluate(c=>c.getContext('webgl2').isContextLost());
 result.archiveAccess=await page.evaluate(()=>window.pineArchiveReads);
 assert.equal(result.contextLost,false);
 assert.deepEqual(result.errors,[]);
 assert.deepEqual(result.archiveAccess,[]);
 assert.ok(result.legs.some(l=>Math.hypot(l.camera[0]-result.initial.camera[0],l.camera[2]-result.initial.camera[2])>20));
 await page.screenshot({path:folder+'/end.png'});
 result.passed=true;
} finally {
 const video=page.video();
 await context.close();
 if(video) await copyFile(await video.path(),folder+'/continuous.webm');
 await browser.close();
 await writeFile(folder+'/results.json',JSON.stringify(result,null,2)+'\n');
}
