// Produce the visual overlay from already converted Pine Forest source data.
// No terrain, landmark, source Blender file or placement is written.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import sharp from 'sharp';

const root='public/forest-origin-assets', out=path.join(root,'visual-finish');
const tiles=path.join(root,'batch2/tiles');
const source=process.argv[2];
if(!source) throw Error('Pass the original Pine Forest textures directory');
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const manifest=await json(path.join(tiles,'manifest.json'));
const species=manifest.names.slice(manifest.propAssetCount);
await mkdir(out,{recursive:true});

const size=1024, low=[-104,-101], span=[206,202];
const weights=new Float32Array(size*size*3);
const counts={moss:0,understory:0,needles:0,trees:0};
const classify=manifest.names.map((name,i)=>i>=manifest.propAssetCount ? 3 : /^moss_patch/.test(name) ? 0 : /^(fern|grass|(?:pine|fir)_sapling)/.test(name) ? 1 : /^(pine_cover|cover_)/.test(name) ? 2 : -1);
const radius=[0.49,0.83,0.58], gain=[.68,1.3,.54], labels=['moss','understory','needles','trees'];
for(const [key,{trees,props}] of Object.entries(manifest.tiles)) {
  const bytes=gunzipSync(await readFile(path.join(tiles,key+'.bin.gz')));
  assert.equal(bytes.length,52*(trees+props));
  for(let i=0;i<bytes.length;i+=52) {
    const group=classify[bytes.readFloatLE(i)];
    if(group<0) continue;
    counts[labels[group]]++;
    if(group===3) continue;
    const x=(bytes.readFloatLE(i+16)-low[0])*size/span[0]-.5;
    const y=(1-(bytes.readFloatLE(i+32)-low[1])/span[1])*size-.5;
    // World footprint from the source transform; use a soft kernel since
    // this represents aggregate cover under individual streamed geometry.
    const scale=Math.hypot(bytes.readFloatLE(i+4),bytes.readFloatLE(i+20),bytes.readFloatLE(i+36));
    const r=radius[group]*size/span[0]*Math.min(1.8,Math.max(.48,scale));
    for(let j=Math.max(0,Math.ceil(y-r));j<=Math.min(size-1,y+r);j++) {
      for(let k=Math.max(0,Math.ceil(x-r));k<=Math.min(size-1,x+r);k++) {
        const w=1-((k-x)**2+(j-y)**2)/(r*r);
        if(w>0) weights[(j*size+k)*3+group]+=gain[group]*w*w;
      }
    }
  }
}
assert.equal(counts.trees,585);
const moss=await sharp(path.join(source,'moss_diff.png')).removeAlpha().toColourspace('srgb').resize(256,256,{fit:'fill'}).raw().toBuffer();
const floor=Buffer.alloc(weights.length);
for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
  const i=(y*size+x)*3, mossGreen=moss[((y%256)*256+x%256)*3+1]/255;
  floor[i]=Math.round(255*(1-Math.exp(-weights[i]*.85))*(.62+.38*mossGreen));
  floor[i+1]=Math.round(255*(1-Math.exp(-weights[i+1]*.72)));
  floor[i+2]=Math.round(255*(1-Math.exp(-weights[i+2]*.65)));
}
await sharp(floor,{raw:{width:size,height:size,channels:3}}).webp({lossless:true,effort:4}).toFile(path.join(out,'understory.webp'));

// A second *source view* behind the primary branches adds visible crown
// volume on the same quad. Keep primary silhouette, trunk, angles, world
// bounds and texel density. This is not a change to the runtime alpha test.
const atlasNames=['pine_01','pine_02','pine_03','pine_04','pine_05','silver_fir_02','silver_fir_04','silver_fir_06'];
const ridgeNames=['pine_02','pine_04','silver_fir_04','silver_fir_06'];
const ridgeTiles=[];
const crowns=[];
for(const name of atlasNames) for(const detail of (name==='pine_04' ? [false,true]:[false])) {
  const prefix=path.join(root,detail ? 'batch3/impostors':'batch2/impostors',name);
  const meta=await json(prefix+'.json');
  const [w,h]=meta.tile, [width,height]=meta.atlas;
  const {data,info}=await sharp(prefix+'.webp').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([info.width,info.height],[width,height]);
  const result=Buffer.from(data);
  let before=0,after=0;
  for(let view=0;view<meta.views;view++) {
    const alternate=(view+(view%2===0 ? 1:meta.views-1))%meta.views;
    const origin=(Math.floor(view/4)*h*width+(view%4)*w)*4;
    const other=(Math.floor(alternate/4)*h*width+(alternate%4)*w)*4;
    for(let y=0;y<.68*h;y++) for(let x=0;x<w;x++) {
      const fade=Math.max(0,Math.min(1,(.68-y/h)*9));
      const sx=Math.round((x-w*.5)/1.15+w*(view%2===0 ? .535:.465));
      const sy=Math.round(y*.97+h*.018);
      if(sx<0 || sx>=w) continue;
      const a=origin+(y*width+x)*4, b=other+(sy*width+sx)*4;
      const front=data[a+3]/255;
      const back=(1-front)*data[b+3]/255*.75*fade;
      const coverage=front+back;
      if(coverage>0) {
        for(let c=0;c<3;c++)result[a+c]=Math.round((front*data[a+c]+back*data[b+c]*[.80,.85,.76][c])/coverage);
        result[a+3]=Math.round(coverage*255);
      }
      before+=front;after+=coverage;
    }
  }
  assert.ok(after>before);
  const nameOut=name+(detail ? '-detail':'')+'.webp';
  await sharp(result,{raw:{width,height,channels:4}}).webp({quality:86,alphaQuality:97}).toFile(path.join(out,nameOut));
  crowns.push({name:nameOut,crownAlphaIncrease:Math.round((after/before-1)*1000)/10});
  if(!detail && ridgeNames.includes(name)) {
    ridgeTiles.push({name, input:await sharp(result,{raw:{width,height,channels:4}})
      .extract({left:0,top:0,width:w,height:h}).resize(128,256,{fit:'fill'}).webp({lossless:true}).toBuffer()});
  }
}
await sharp({create:{width:512,height:256,channels:4,background:'#00000000'}}).composite(ridgeNames.map((name,i)=>({input:ridgeTiles.find(item=>item.name===name).input,left:i*128,top:0}))).webp({quality:87}).toFile(path.join(out,'edge-crowns.webp'));

// Continuation outside the authored area. Reflect irregular source stands
// across the nearest edge and progressively space them out into the haze.
// Keep the exact interior list and collision/streaming manifests untouched.
const placements=await json(path.join(root,'source-tree-placements.json'));
assert.equal(placements.length,585);
const borders=[-102.7,100,-100,100];
const {data:heightField,info:heightInfo}=await sharp(path.join(root,'environment/height-light.png')).removeAlpha().raw().toBuffer({resolveWithObject:true});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function boundaryHeight(x,z) {
  const px=clamp(Math.floor((clamp(x,-98.8,98.8)-low[0])*heightInfo.width/span[0]),0,heightInfo.width-1);
  const py=clamp(Math.floor((1-(-clamp(z,-98.8,98.8)-low[1])/span[1])*heightInfo.height),0,heightInfo.height-1);
  const i=(py*heightInfo.width+px)*heightInfo.channels;
  return (256*heightField[i]+heightField[i+1])*64/65535-20;
}
function edgeHeight(x,z) {
  const d=Math.max(0,Math.abs(x)-98.8,Math.abs(z)-98.8);
  const mix=1-Math.exp(-d/32);
  return boundaryHeight(x,z)*(1-mix)-.6+mix*(2.1*Math.sin(.034*x+.028*z)+1.9*Math.sin(.072*z-.019*x)+d*.028);
}
// A low surface under the source border, then increasingly wide bands. The
// authored terrain is always above the inner edge of this scenery surface.
const positions=[],colors=[],indices=[];
const rings=[98.5,101.5,107,118,136,158,185,222,285,440,640], steps=192;
const sRGBToLinear=v=>v<.04045 ? v/12.92:((v+.055)/1.055)**2.4;
for(const [ring,extent] of rings.entries()) for(let i=0;i<steps;i++) {
  const side=Math.floor(i/(steps/4)), t=i/(steps/4)-side;
  const x=extent*[-1+2*t,1,1-2*t,-1][side],z=extent*[-1,-1+2*t,1,1-2*t][side];
  const scatter=Math.cos(.14*x+.045*z)*Math.sin(.12*z-.038*x);
  const d=clamp((extent-100)/165,0,1);
  positions.push(x,+edgeHeight(x,z).toFixed(3),z);
  for(const v of [.275+.035*scatter+.065*d,.30+.045*scatter+.072*d,.179+.022*scatter+.142*d]) colors.push(+sRGBToLinear(v).toFixed(4));
  if(ring>0) {
    const a=(ring-1)*steps+i,b=(ring-1)*steps+(i+1)%steps,c=ring*steps+i,e=ring*steps+(i+1)%steps;
    indices.push(a,b,c,b,e,c);
  }
}
await writeFile(path.join(out,'edge-ground.json'),JSON.stringify({positions,colors,indices})+'\n');
const extent=(x,z)=>Math.min(x-borders[0],borders[1]-x,z-borders[2],borders[3]-z);
const edge=[];
for(const [i,{source:name,matrix:m}] of placements.entries()) {
  const x=m[0][3], z=-m[1][3];
  const margins=[x-borders[0],borders[1]-x,z-borders[2],borders[3]-z];
  const d=Math.min(...margins);
  if(d<0 || d>36) continue;
  const side=margins.indexOf(d), normal=[[-1,0],[1,0],[0,-1],[0,1]][side];
  const s=Math.hypot(m[0][2],m[1][2],m[2][2]);
  const variant=name.startsWith('pine') ? i%2 : 2+i%2;
  for(let band=0;band<3;band++) {
    const h=i*2.39996323+band*1.693;
    if(band===2 && Math.cos(h)<-.25) continue;
    const across=2*d+4+band*38+Math.sin(h)*(2+band*5);
    const along=Math.cos(h)*(4+band*15);
    const px=x+normal[0]*across-normal[1]*along,pz=z+normal[1]*across+normal[0]*along;
    if(extent(px,pz)>-.8) continue;
    edge.push([px,edgeHeight(px,pz),pz,s*(.9+.12*Math.cos(h)),variant].map(value=>Math.round(value*100)/100));
  }
}
assert.ok(edge.length>400 && edge.length<1000);
await writeFile(path.join(out,'edge-stands.json'),JSON.stringify(edge)+'\n');
await writeFile(path.join(out,'production.json'),JSON.stringify({floorResolution:size,world:{low,span},counts,crowns,edgeTrees:edge.length,ridgeNames,borders},null,2)+'\n');
console.log({counts,crowns,edgeTrees:edge.length});
