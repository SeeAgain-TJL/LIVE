import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { createSeed } from '../src/data/seed.ts';
const output='artifacts-local/r1/performance';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();
const base=process.env.REVIEW_URL||'http://127.0.0.1:3321';const records=[];const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(base);const seed=createSeed();seed.planets=[{...seed.planets[0],id:'performance-world',isDemo:false,name:'隔离性能测试星球'}];await page.evaluate(d=>localStorage.setItem('universe-of-me:data:v1',JSON.stringify(d)),seed);
 for(const mode of ['universe','world']) for(const tier of (mode==='universe'?['low','medium','high']:['low','high'])) {
  await page.goto(base+(mode==='world'?'/planet/performance-world':''));
  if(mode==='world'){await page.getByRole('button',{name:'世界设置与帮助',exact:true}).click();await page.getByLabel('世界渲染质量').selectOption(tier);}
  else {await page.getByRole('button',{name:'设置与帮助',exact:true}).click();await page.getByLabel('宇宙渲染质量').selectOption(tier);}
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.renderMetrics);await page.waitForTimeout(2000);
  const samples=[];for(let i=0;i<10;i++){await page.waitForTimeout(1050);samples.push(await page.locator('canvas').first().evaluate(c=>JSON.parse(c.dataset.renderMetrics)));}
  const gpu=await page.locator('canvas').first().evaluate(c=>{const gl=c.getContext('webgl2');const ext=gl?.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl?.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency};});
  records.push({scene:mode,tier,viewport:{width:1440,height:900},gpu,samples});console.log(mode,tier, samples.map(s=>s.fps).join(','));
  await page.screenshot({path:output+'/'+mode+'-'+tier+'.png'});
 }
 await writeFile(output+'/measurements.json',JSON.stringify({capturedAt:new Date().toISOString(),records,errors},null,2));
}finally{await context.close();await browser.close();}
