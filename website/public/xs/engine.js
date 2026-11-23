// 大肥鱼修仙记 · 引擎核心（全新，不依赖 b16）。像素风俯视/横版通用：主循环、输入、相机、图集动画、格子地图与碰撞、面朝格子。
export const TILE=32;
const cache=new Map();
export function loadImage(src){if(cache.has(src))return cache.get(src);const p=(async()=>{const url=globalThis.__xsResolve?await globalThis.__xsResolve(src):src;return new Promise((ok,no)=>{const i=new Image();i.decoding='async';i.onload=()=>ok(i);i.onerror=()=>no(Error('图片加载失败 '+src));i.src=url})})();cache.set(src,p);return p}
// ---------- 输入：键盘 + 触屏摇杆 + 动作键 ----------
export class Input{
 constructor(root){this.keys=new Set();this.pressed=new Set();this.joy=null;this.root=root;
  this.kd=e=>{if(e.target.closest?.('input,textarea,select'))return;const k=norm(e);if(!this.keys.has(k))this.pressed.add(k);this.keys.add(k);if(GAME_KEYS.has(k))e.preventDefault()};
  this.ku=e=>this.keys.delete(norm(e));this.blur=()=>this.keys.clear();
  addEventListener('keydown',this.kd);addEventListener('keyup',this.ku);addEventListener('blur',this.blur);
 }
 axis(){let x=0,y=0;const k=this.keys;if(k.has('a')||k.has('arrowleft'))x--;if(k.has('d')||k.has('arrowright'))x++;if(k.has('w')||k.has('arrowup'))y--;if(k.has('s')||k.has('arrowdown'))y++;
  const l=Math.hypot(x,y);return l>1?{x:x/l,y:y/l}:{x,y}}
 hit(k){if(this.pressed.has(k)){this.pressed.delete(k);return true}return false}
 tap(k){this.pressed.add(k)}
 endFrame(){this.pressed.clear()}
 destroy(){removeEventListener('keydown',this.kd);removeEventListener('keyup',this.ku);removeEventListener('blur',this.blur);}
}
const GAME_KEYS=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','e','shift']);
function norm(e){return e.key.length===1?e.key.toLowerCase():e.key.toLowerCase()}
// ---------- 图集动画 ----------
// clips: {name:{row?,start,n,fps,loop,dirs?}}；dirs={down:row,left:row,up:row,right:row|'flip-left'}
export class Sheet{
 constructor(img,fw,fh,clips,{cols,foot=.97,scale=1}={}){this.img=img;this.fw=fw;this.fh=fh;this.cols=cols||Math.floor(img.naturalWidth/fw);this.clips=clips;this.foot=foot;this.scale=scale}
 frame(name,t){const c=this.clips[name]||this.clips.idle;const i=c.loop===false?Math.min(c.n-1,Math.floor(t*c.fps)):Math.floor(t*c.fps)%c.n;return c.start+i}
 dur(name){const c=this.clips[name];return c?c.n/c.fps:0}
 draw(g,x,y,name,t,{flip=false,h=null,alpha=1,tint=null}={}){const f=this.frame(name,t),sx=(f%this.cols)*this.fw,sy=Math.floor(f/this.cols)*this.fh,H=h||this.fh*this.scale,Wd=H*this.fw/this.fh;
  g.save();g.globalAlpha=alpha;g.translate(x,y);if(flip)g.scale(-1,1);if(tint)g.filter=tint;g.drawImage(this.img,sx,sy,this.fw,this.fh,-Wd/2,-H*this.foot,Wd,H);g.restore()}
}
// ---------- 格子地图 ----------
// json: {w,h,bg:'url',layers:{solid:'01..'(行拼接),...},objs:[{id,x,y,w,h,kind,...}],exits:[...],spawn:[x,y]}
export class TileMap{
 constructor(json,bg){Object.assign(this,json);this.bgImg=bg;this.solid=new Uint8Array(this.w*this.h);const s=json.layers?.solid||'';for(let i=0;i<this.solid.length;i++)this.solid[i]=s[i]==='1'?1:0;this.objs=json.objs||[];this.exits=json.exits||[]}
 get pw(){return this.w*TILE}get ph(){return this.h*TILE}
 blocked(tx,ty){return tx<0||ty<0||tx>=this.w||ty>=this.h||!!this.solid[ty*this.w+tx]}
 blockedPx(x,y){return this.blocked(Math.floor(x/TILE),Math.floor(y/TILE))}
 // 脚底碰撞盒（宽 hw*2，高 hh）
 boxFree(x,y,hw=10,hh=8){return !this.blockedPx(x-hw,y-hh)&&!this.blockedPx(x+hw,y-hh)&&!this.blockedPx(x-hw,y)&&!this.blockedPx(x+hw,y)}
 drawBg(g){if(this.bgImg)g.drawImage(this.bgImg,0,0,this.pw,this.ph)}
}
// ---------- 角色 ----------
export class Actor{
 constructor({x,y,sheet,speed=120,name='',id=''}){Object.assign(this,{x,y,sheet,speed,name,id});this.dir='down';this.clip='idle';this.t=0;this.anim=null;this.flip=false;this.moving=false;this.lock=0}
 face(dx,dy){if(Math.abs(dx)>Math.abs(dy)){this.dir=dx<0?'left':'right'}else if(dy){this.dir=dy<0?'up':'down'}}
 move(map,vx,vy,dt){this.moving=!!(vx||vy);if(!this.moving)return;this.face(vx,vy);const nx=this.x+vx*this.speed*dt,ny=this.y+vy*this.speed*dt;if(map.boxFree(nx,this.y))this.x=nx;if(map.boxFree(this.x,ny))this.y=ny}
 play(name){this.anim={name,t:0};this.lock=this.sheet.dur(name)}
 update(dt){this.t+=dt;if(this.anim){this.anim.t+=dt;this.lock-=dt;if(this.lock<=0)this.anim=null}}
 facingTile(){const tx=Math.floor(this.x/TILE),ty=Math.floor((this.y-6)/TILE);return this.dir==='left'?[tx-1,ty]:this.dir==='right'?[tx+1,ty]:this.dir==='up'?[tx,ty-1]:[tx,ty+1]}
}
// ---------- 相机 ----------
export class Camera{constructor(){this.x=0;this.y=0;this.z=2}
 follow(a,vw,vh,map,dt){const tx=a.x-vw/this.z/2,ty=a.y-vh/this.z/2,k=Math.min(1,dt*8);this.x+=(tx-this.x)*k;this.y+=(ty-this.y)*k;this.x=Math.max(0,Math.min(map.pw-vw/this.z,this.x));this.y=Math.max(0,Math.min(map.ph-vh/this.z,this.y));if(map.pw<vw/this.z)this.x=(map.pw-vw/this.z)/2;if(map.ph<vh/this.z)this.y=(map.ph-vh/this.z)/2}
 apply(g,dpr){const k=dpr*this.z;g.setTransform(k,0,0,k,-Math.round(this.x*k),-Math.round(this.y*k))}
 toWorld(sx,sy){return [sx/this.z+this.x,sy/this.z+this.y]}}
// ---------- 主循环 ----------
export class Loop{constructor(fn){this.fn=fn;this.raf=0;this.last=0;this.on=false}
 start(){this.on=true;const tick=n=>{if(!this.on)return;const dt=Math.min(.05,(n-(this.last||n))/1000);this.last=n;this.fn(dt);this.raf=requestAnimationFrame(tick)};this.raf=requestAnimationFrame(tick)}
 stop(){this.on=false;cancelAnimationFrame(this.raf)}}

// ---------- 点击寻路（A*，4 邻接，格子 32px） ----------
export function findPath(map,from,to){
 const W=map.w,key=(x,y)=>y*W+x,[sx,sy]=from;let [tx,ty]=to;
 if(map.blocked(tx,ty)){let best=null,bd=1e9;for(let r=1;r<6&&!best;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const x=tx+dx,y=ty+dy;if(!map.blocked(x,y)){const d=dx*dx+dy*dy;if(d<bd){bd=d;best=[x,y]}}}if(!best)return null;[tx,ty]=best}
 const open=[[sx,sy,0,Math.abs(tx-sx)+Math.abs(ty-sy)]],g=new Map([[key(sx,sy),0]]),prev=new Map();let n=0;
 while(open.length&&n++<6000){let bi=0;for(let i=1;i<open.length;i++)if(open[i][3]<open[bi][3])bi=i;const [x,y,gc]=open.splice(bi,1)[0];
  if(x===tx&&y===ty){const out=[];let k=key(x,y);while(k!==key(sx,sy)){out.unshift([k%W,Math.floor(k/W)]);k=prev.get(k)}return out}
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(map.blocked(nx,ny))continue;const k=key(nx,ny),ng=gc+1;if(ng<(g.get(k)??1e9)){g.set(k,ng);prev.set(k,key(x,y));open.push([nx,ny,ng,ng+Math.abs(tx-nx)+Math.abs(ty-ny)])}}}
 return null;
}
