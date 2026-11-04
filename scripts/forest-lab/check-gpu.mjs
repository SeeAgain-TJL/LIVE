import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage();
const info = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
});
console.log(JSON.stringify(info));
await browser.close();
