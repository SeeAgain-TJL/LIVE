import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import sharp from "sharp";
import { visualPresets } from "../src/components/three/visual-library.ts";

const dir = process.argv[2] ?? "artifacts-local/planet-visual-library-v1/source";
const out = "public/planet-visual-assets/v1";
const docs = "docs/planet-visual-library-v1";
const solar = "https://www.solarsystemscope.com/textures/download/";
const jpl = "https://maps.jpl.nasa.gov/tmaps/pix/";
const moon = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const solarSource = file => ({ url: solar + file, page: "https://www.solarsystemscope.com/textures/", credit: "Solar System Scope / INOVE", license: "https://creativecommons.org/licenses/by/4.0/" });
const jplSource = (file, body, credit) => ({ url: jpl + file, page: `https://maps.jpl.nasa.gov/tmaps/${body}.html`, credit, license: "https://www.jpl.nasa.gov/jpl-image-use-policy/" });
const nasaSource = (file, credit) => ({ url: moon + file, page: "https://svs.gsfc.nasa.gov/4720/", credit, license: "https://www.nasa.gov/nasa-brand-center/images-and-media/" });
const sources = {
  mars: solarSource("2k_mars.jpg"), jupiter: solarSource("2k_jupiter.jpg"), saturn: solarSource("2k_saturn.jpg"),
  rings: solarSource("2k_saturn_ring_alpha.png"), neptune: solarSource("2k_neptune.jpg"), venus: solarSource("2k_venus_atmosphere.jpg"),
  earth: solarSource("2k_earth_daymap.jpg"), clouds: solarSource("2k_earth_clouds.jpg"), water: solarSource("2k_earth_specular_map.tif"),
  europa: jplSource("jup2vss2.jpg", "jupiter", "Courtesy NASA/JPL-Caltech/USGS; Voyager mosaic"),
  ganymede: jplSource("jup3vss2.jpg", "jupiter", "Courtesy NASA/JPL-Caltech/USGS; Voyager mosaic"),
  neptuneClouds: jplSource("nep0fds1.jpg", "neptune", "Don Davis, courtesy NASA/JPL-Caltech; authored fictional texture"),
  moon: nasaSource("lroc_color_2k.jpg", "NASA's Scientific Visualization Studio / Ernie Wright; LRO/LROC"),
  moonHeight: nasaSource("ldem_3_8bit.jpg", "NASA's Scientific Visualization Studio / Ernie Wright; LRO/LOLA"),
};
const recipes = {
  "red-wastes": ["mars"], "ancient-strata": ["moon", "moonHeight"], "jade-ocean": ["earth", "water", "clouds"],
  "abyssal-ocean": ["earth", "water", "clouds"], "glacial-rift": ["europa"], "crystal-frost": ["ganymede", "europa"],
  tempest: ["jupiter"], "cobalt-giant": ["neptune", "neptuneClouds"], "gilded-rings": ["saturn", "rings"],
  "midnight-arcs": ["neptuneClouds", "saturn", "rings"], "violet-haze": ["venus"], "verdant-world": ["earth", "water", "clouds"],
};
const images = {};
for (const [name, source] of Object.entries(sources)) {
  const original = await readFile(path.join(dir, name));
  const image = sharp(original);
  const { width, height } = await image.metadata();
  Object.assign(source, { width, height, sha256: sha(original) });
  images[name] = await image.toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
const clamp = (a, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, a));
const mix = (a,b,t) => a+(b-a)*t;
const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a)); return t*t*(3-2*t); };
const luma = ([r,g,b]) => (.23*r+.65*g+.12*b)/255;
const sample = (name,u,v,channel) => {
  const {data,info:{width:w,height:h}}=images[name];
  const x=((u%1+1)%1)*w, y=clamp(v)*(h-1), ix=Math.floor(x), iy=Math.floor(y), nx=(ix+1)%w, ny=Math.min(h-1,iy+1);
  const read = c => mix(mix(data[(iy*w+ix)*4+c],data[(iy*w+nx)*4+c],x-ix),mix(data[(ny*w+ix)*4+c],data[(ny*w+nx)*4+c],x-ix),y-iy);
  return channel === undefined ? [read(0),read(1),read(2)] : read(channel);
};
const ramp=(lo,hi,t)=>lo.map((a,i)=>mix(a,hi[i],clamp(t)));
const at=(id,u,v)=>{
  if (id==="red-wastes") {
    const [r,g,b]=sample("mars",u,v), m=(r+g+b)/765;
    const saturation=smooth(.15,.53,(r-b)/255);
    const color=[r*.9+6, g*.78+12, b*.72+15].map((x,i)=>mix(x, [146,106,90][i], (1-saturation)*smooth(.67,.97,m)*.73));
    return [...color,.50+(m-.5)*.62,.78+m*.15,0];
  }
  if (id==="ancient-strata") {
    const t=luma(sample("moon",u,v)), elevation=sample("moonHeight",u,v,0)/255;
    return [...ramp([37,42,48],[196,189,179],smooth(.16,.89,t)),elevation,.82+t*.12,0];
  }
  if (id==="glacial-rift") {
    const t=luma(sample("europa",u,v)), deep=1-smooth(.20,.68,t);
    return [...ramp([26,56,85],[216,228,229],smooth(.13,.92,t)),.30+.48*t,.53+.34*(1-deep),0];
  }
  if (id==="crystal-frost") {
    const a=luma(sample("ganymede",u,v)), b=luma(sample("europa",u+.15,v));
    const t=.79*a+.21*b, mineral=1-smooth(.36,.61,t);
    return [...ramp([58,139,155],[222,235,237],smooth(.20,.82,t)),.31+.47*t,.26+(1-mineral)*.37,0];
  }
  if (["jade-ocean","abyssal-ocean","verdant-world"].includes(id)) {
    const jade=id==="jade-ocean", deep=id==="abyssal-ocean", p=2*Math.PI*u, q=Math.PI*v;
    // Warp a real coastline field rather than repeat a synthetic continent tile.
    const tilt = jade ? .47 : deep ? -.36 : .25;
    const x = Math.cos(p) * Math.sin(q), y = Math.cos(q), z = Math.sin(p) * Math.sin(q);
    const rotatedX = x * Math.cos(tilt) - y * Math.sin(tilt);
    const rotatedY = x * Math.sin(tilt) + y * Math.cos(tilt);
    const lon = Math.atan2(z, rotatedX) / (2 * Math.PI) + (jade ? .40 : deep ? .68 : .52)
      + .036 * Math.sin(q * 2.6) + .022 * Math.sin(2 * p + q) * Math.sin(q);
    const lat = clamp(.5 - Math.asin(clamp(rotatedY, -1, 1)) * .91 / Math.PI
      + .025 * Math.sin(p * 2 + q) * Math.sin(q));
    const coast=(du,dv)=>sample("water",lon+du,clamp(lat+dv),0)/255;
    const wet=coast(0,0), coverage=(wet*2+coast(.004,0)+coast(-.004,0)+coast(0,.007)+coast(0,-.007))/6;
    const cover=(coverage+coast(.011,.012)+coast(-.011,-.012))/3;
    const land=(1-smooth(.25,.68,wet))*(deep?smooth(.01,.36,Math.sin(p*2+q*2)*Math.cos(q*3)*.62-.16+(1-cover)*.31):1);
    const shallow=(1-smooth(.54,.95,coverage))*(1-land);
    const rgb=sample("earth",lon,lat);
    const green=smooth(-.07,.10,(rgb[1]-rgb[0])/255);
    const lift=luma(rgb), country= jade?ramp([58,75,59],[157,132,93],.75*lift+.25*green):deep?ramp([74,96,89],[134,142,104],lift):ramp([33,65,47],[119,136,79],.35*lift+.65*green);
    const sea=jade?ramp([13,74,81],[66,146,122],shallow):deep?ramp([13,39,82],[43,112,141],shallow):ramp([12,44,75],[65,137,130],shallow);
    const weather=sample("clouds",u+(jade?.28:deep?.08:.64)+.105*Math.sin(q*2),clamp(v+.025*Math.sin(p*2)*Math.sin(q)),0)/255;
    const cloud=deep?smooth(.12,.83,weather)*(.66+.34*Math.sin(q*1.4)):smooth(.17,.85,weather)*(jade?.86:.75);
    return [...sea.map((c,i)=>mix(c,country[i],land)),mix(.34,.42+lift*.20,land),mix(deep?.31:.36,.84,land),cloud];
  }
  if (id==="tempest") {
    const c=sample("jupiter",u,v); return [c[0]*1.04,c[1]*.94,c[2]*.89+7,.5,.94,0];
  }
  if (id==="gilded-rings") {
    const c=sample("saturn",u,v); return [c[0]*1.03,c[1]*.97,c[2]*.82,.5,.94,0];
  }
  if (id==="violet-haze") {
    const t=luma(sample("venus",u,v)); return [...ramp([35,34,75],[185,162,207],smooth(.27,.89,t)),.5,.92,0];
  }
  const base=sample("neptune",u,v), structure=sample("neptuneClouds",u+.11,v);
  const clouds=smooth(.26,.62,luma(structure)), bright=smooth(.24,.64,luma(base));
  if(id==="midnight-arcs") return [...ramp([19,31,59],[112,151,181],clouds*.56+luma(sample("saturn",u,v))*.34),.5,.94,0];
  return [...ramp([20,41,104],[137,192,224],bright*.75+clouds*.25),.5,.93,0];
};
await mkdir(out,{recursive:true}); await mkdir(docs,{recursive:true});
const assets={};
for(const preset of visualPresets) {
  const id=preset.id; assets[id]={ sources:recipes[id], tiers:{} };
  for(const [tier,width] of Object.entries({high:1024,medium:512,low:256})) {
    const height=width/2, output=Buffer.allocUnsafe(8+width*height*6);
    output.write("PVL1"); output.writeUInt16LE(width,4); output.writeUInt16LE(height,6);
    for(let y=0;y<height;y++) {
      const previous=[0,0,0,0,0,0], v=1-y/(height-1);
      for(let x=0;x<width;x++) {
        const u=(y===0||y===height-1||x===width-1)?0:x/(width-1), q=at(id,u,v);
        const pixel=q.map((val,i)=>Math.round(clamp(i<3?(tier==="low"?mix(val,225,q[5]*.61):val):val*255,0,255)));
        for(let c=0;c<6;c++) { output[8+(y*width+x)*6+c]=(pixel[c]-previous[c])&255; previous[c]=pixel[c]; }
      }
    }
    const file=`${id}-${tier}.pvl`, packed=gzipSync(output,{level:9});
    await writeFile(path.join(out,file),packed);
    assets[id].tiers[tier]={file,width,height,bytes:packed.length,sha256:sha(packed)};
  }
  console.log(id, Object.values(assets[id].tiers).reduce((n,x)=>n+x.bytes,0));
}
const radial=Array.from({length:64},(_,i)=>{
  const u=(i+.5)/64; let sum=0;
  for(let j=-5;j<=5;j++) sum+=sample("rings",u+j/(64*12),.5,3);
  return +(sum/(255*11)).toFixed(4);
});
await writeFile("src/components/three/visual-ring-profile.ts", `// Generated from Solar System Scope Saturn Ring alpha (CC BY 4.0); see asset manifest.\nexport const visualRingProfile = [${radial.join(", ")}] as const;\n`);
const manifest = JSON.stringify({ sources, assets, radial },null,2)+"\n";
await writeFile(path.join(docs,"assets.json"),manifest);
await writeFile(path.join(out,"credits.json"),manifest);
