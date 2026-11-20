// One shared GPU mesh atlas, fixed source pose, continuous bone weights.
// There is no frame-strip animation, sprite swapping or per-message timer.
const base='/assets/owner52-v031/';
const loadImage=(doc,src,signal)=>new Promise((resolve,reject)=>{const i=new doc.defaultView.Image(),abort=()=>{i.src='';reject(new DOMException('已取消','AbortError'))},done=fn=>value=>{signal?.removeEventListener('abort',abort);fn(value)};if(signal?.aborted)return abort();i.onload=done(()=>resolve(i));i.onerror=done(reject);signal?.addEventListener('abort',abort,{once:true});i.src=src;});
const bounds=[[85,0,260,310],[385,0,570,310],[670,0,855,311],[925,0,1120,312],[1135,0,1482,312],[1500,0,1745,310]];
const pixelBounds=[[75,45,235,320],[345,45,520,320],[650,45,820,320],[940,45,1125,320],[1180,45,1475,320],[1515,45,1740,320]];
export async function createCharacterRig(doc=document,{signal}={}){
 const [normal,pixel]=await Promise.all([loadImage(doc,base+'characters-v2.webp',signal),loadImage(doc,base+'pixels-v2.webp',signal)]);
 signal?.throwIfAborted();
 const atlas=doc.createElement('canvas');atlas.width=576;atlas.height=192;
 const gl=atlas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true});
 if(!gl)return staticRig(atlas,normal,pixel);
 const vertex=`precision highp float;
 attribute vec2 a_point;uniform float u_time;uniform float u_character;uniform float u_pixel;uniform vec4 u_crop;varying vec2 v_uv;
 float bell(vec2 p,vec2 center,vec2 spread){vec2 d=(p-center)/spread;return exp(-dot(d,d)*2.0);}
 vec2 spin(vec2 p,vec2 pivot,float a){float c=cos(a),s=sin(a);vec2 d=p-pivot;return pivot+vec2(d.x*c-d.y*s,d.x*s+d.y*c);}
 void main(){
  vec2 p=a_point;float t=u_time+u_character*.71+u_pixel*2.37;
  // Feet remain grounded; upper torso and neck share a smooth skinning field.
  float head=1.0-smoothstep(.33,.51,p.y);
  float action=mod(u_character+u_pixel*3.0,6.0);
  float breath=sin(t*1.85)*.022;
  if(action>3.5&&action<4.5)breath=sin(t*2.8)*.045;
  p.y-=breath*(1.0-smoothstep(.34,.94,a_point.y));
  float nod=sin(t*1.13)*.145;
  if(action>4.5)nod=sin(t*.9)*.18;
  p=mix(p,spin(p,vec2(.5,.46),nod),head);
  // Shoulder/elbow gesture: continuous wrist arc, eased at both extremes.
  float left=bell(a_point,vec2(.31,.51),vec2(.16,.20));
  float right=bell(a_point,vec2(.72,.56),vec2(.16,.19));
  float wave=sin(t*(2.05-u_pixel*.43))*.70+sin(t*1.025)*.19;
  if(action>4.5)wave=sin(t*.9)*.36;
  if(action>1.5&&action<2.5){wave=sin(t*2.6)*.38;p.x+=right*max(0.0,sin(t*2.6))*.11;}
  if(action>2.5&&action<3.5){wave=sin(t*1.7)*.80;p.y+=head*sin(t*1.7)*.016;}
  p=mix(p,spin(p,vec2(.39,.46),wave),left);
  p=mix(p,spin(p,vec2(.62,.46),sin(t*1.47)*-.48),right);
  // Hair follows with phase lag; Miku's twin tails have independent inertia.
  float hair=smoothstep(.15,.4,abs(a_point.x-.5))*(1.0-smoothstep(.78,.94,a_point.y));
  float longHair=step(3.5,u_character);
  p.x+=hair*longHair*sin(t*1.38-a_point.y*4.0)*.060;
  p.y+=hair*longHair*sin(t*1.38-a_point.y*4.0+1.0)*.018;
  // Coat/skirt hem counterbalances the upper body, preserving the silhouette.
  p.x+=bell(a_point,vec2(.5,.76),vec2(.27,.13))*sin(t*1.13-1.1)*.030;
  p=spin(p,vec2(.5,.94),sin(t*1.13-1.0)*.048);
  p=(p-.5)*.87+.5;
  gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0,1);
  // Each character uses ONE fixed drawing. UV never changes with time.
  v_uv=(u_crop.xy+a_point*u_crop.zw)/vec2(1774.0,887.0);
 }`;
 const fragment=`precision mediump float;varying vec2 v_uv;uniform sampler2D u_image;uniform vec4 u_clip;void main(){if(v_uv.x<u_clip.x||v_uv.x>u_clip.z||v_uv.y<u_clip.y||v_uv.y>u_clip.w)discard;vec4 c=texture2D(u_image,v_uv);if(c.a<.20)discard;gl_FragColor=c;}`;
 const shader=(kind,src)=>{const s=gl.createShader(kind);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const points=[],nx=24,ny=28;
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)for(const [dx,dy] of [[0,0],[1,0],[0,1],[1,0],[1,1],[0,1]])points.push((x+dx)/nx,(y+dy)/ny);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
 const a=gl.getAttribLocation(program,'a_point');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
 const time=gl.getUniformLocation(program,'u_time'),character=gl.getUniformLocation(program,'u_character'),pixelUniform=gl.getUniformLocation(program,'u_pixel'),crop=gl.getUniformLocation(program,'u_crop'),clip=gl.getUniformLocation(program,'u_clip');
 const textures=[normal,pixel].map((img,i)=>{const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,i?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,i?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);return tex;});
 
 return {atlas,animated:true,destroy(){gl.getExtension('WEBGL_lose_context')?.loseContext();atlas.width=atlas.height=0;},render(seconds,needed){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1f(time,seconds);for(let row=0;row<2;row++){gl.bindTexture(gl.TEXTURE_2D,textures[row]);gl.uniform1f(pixelUniform,row);for(const id of needed){const b=(row?pixelBounds:bounds)[id],size=Math.max(b[2]-b[0],b[3]-b[1]);gl.uniform4f(crop,(b[0]+b[2]-size)/2,(b[1]+b[3]-size)/2,size,size);gl.uniform4f(clip,b[0]/1774,b[1]/887,b[2]/1774,b[3]/887);gl.uniform1f(character,id);gl.viewport(id*96,(1-row)*96,96,96);gl.drawArrays(gl.TRIANGLES,0,points.length/2);}}},paint(canvas,id,pixel){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=!pixel;ctx.drawImage(atlas,id*96,pixel?96:0,96,96,0,0,canvas.width,canvas.height);}};
}


function staticRig(atlas,normal,pixel){const c=atlas.getContext('2d');return {atlas,animated:false,destroy(){atlas.width=atlas.height=0},render(seconds,needed){c.clearRect(0,0,576,192);for(let row=0;row<2;row++)for(const id of needed){const b=(row?pixelBounds:bounds)[id];c.imageSmoothingEnabled=!row;c.drawImage(row?pixel:normal,b[0],b[1],b[2]-b[0],b[3]-b[1],id*96,row*96,96,96)}},paint(canvas,id,pixel){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=!pixel;ctx.drawImage(atlas,id*96,pixel?96:0,96,96,0,0,canvas.width,canvas.height)}}}
