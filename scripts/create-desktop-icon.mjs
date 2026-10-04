import {writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
const size=1024, pixels=Buffer.alloc((size*4+1)*size);
const paths=[[[270,390],[512,270],[754,390],[512,510],[270,390]],[[270,515],[512,635],[754,515]],[[270,640],[512,760],[754,640]]];
const distance=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);};
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const offset=y*(size*4+1)+1+x*4;
 const corner=Math.hypot(Math.max(Math.abs(x-512)-254,0),Math.max(Math.abs(y-512)-254,0));
 const alpha=Math.max(0,Math.min(1,158-corner));
 let ink=0;for(const path of paths)for(let i=1;i<path.length;i++)ink=Math.max(ink,Math.max(0,Math.min(1,20.5-distance(x,y,path[i-1],path[i]))));
 const base=[36,57,82];for(let c=0;c<3;c++)pixels[offset+c]=Math.round(base[c]*(1-ink)+255*ink);pixels[offset+3]=Math.round(255*alpha);
}
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const chunk=(name,data)=>{const type=Buffer.from(name),body=Buffer.concat([type,data]);let crc=0xffffffff;for(const b of body)crc=table[(crc^b)&255]^(crc>>>8);const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,body,tail]);};
const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
await writeFile('desktop/assets/icon.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
await writeFile('desktop/assets/icon.svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect x="100" y="100" width="824" height="824" rx="158" fill="#243952"/><g fill="none" stroke="white" stroke-width="40" stroke-linecap="round" stroke-linejoin="round">${paths.map(path=>`<path d="M${path.map(p=>p.join(',')).join(' L')}"/>`).join('')}</g></svg>\n`);
