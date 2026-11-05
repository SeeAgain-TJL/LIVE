import {Tree} from '../../artifacts-local/pine-game-trees/ez-tree.mjs';
import fs from 'node:fs';
const result=[];
for(const [i,preset] of ['Pine Large','Pine Medium','Pine Large','Pine Medium'].entries()){
 const tree=new Tree();tree.loadPreset(preset); if(i===3){tree.options.seed=9182;tree.generate();}
 const meshes=tree.createGeometry();
 const parts=Object.entries(meshes).map(([name,g])=>({name,position:Array.from(g.attributes.position.array),normal:Array.from(g.attributes.normal.array),uv:Array.from(g.attributes.uv.array),index:Array.from(g.index.array)}));
 result.push({preset,seed:tree.options.seed,alphaTest:tree.options.leaves.alphaTest,parts});
 console.log(i,preset,parts.map(p=>p.index.length/3));
}
fs.writeFileSync('artifacts-local/pine-game-trees/generated.json',JSON.stringify(result));

