import React, { useEffect, useRef } from 'react';
import type { VisualizerState } from './core/types';

export type OrqestShaderKind = 'apparition';

type Props = {
  kind: OrqestShaderKind;
  width: number;
  height: number;
  state: VisualizerState;
  audioLevel: number;
  zcr?: number;
  rmsHigh?: number;
  backgroundColor: string;
};

const VERTEX = `#version 300 es
in vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;

// WebGL port of Orqest's SkSL visualizers. The five looks share the same
// audio/state driver, just as the native skia-shader engine does.
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform float time, audio, articulation, stateIndex, variant;
uniform vec3 primaryColor, secondaryColor, accentColor, shadowColor;
out vec4 outColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.52; for(int i=0;i<5;i++){v+=a*noise(p);p=mat2(1.83,-.58,.58,1.83)*p+7.7;a*=.5;}return v;}
float bump(vec2 p,vec2 c,vec2 s){vec2 q=(p-c)/s;return exp(-dot(q,q));}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*resolution)/min(resolution.x,resolution.y); uv.y=-uv.y;
 float drive=.16+stateIndex*.055+audio*1.8; float t=time*drive; float energy=clamp(audio*1.35+articulation*.25,0.,1.4);
 vec3 col=vec3(0.); float alpha=1.;
 if(variant<.5){
   vec2 p=uv*1.45; float w=fbm(p*1.1+vec2(t*.25,-t*.5));
   float c=fbm(p*2.+vec2(-t*.35,t*.22)+(w-.5));
   float cloud=smoothstep(.24,.8,w*.72+c*.45); float ray=pow(max(0.,1.-abs(uv.x+.18)*1.5),3.)*.16;
   col=mix(shadowColor,primaryColor,cloud)+secondaryColor*(c*c*.38+ray)+accentColor*energy*cloud*.16;
 }else if(variant<1.5){
   vec2 p=uv*1.6; vec2 q=vec2(fbm(p+vec2(t*.2,-t*.34)),fbm(p.yx+vec2(-t*.18,t*.22)))-.5;
   float a=fbm(p+q*.9),b=fbm(p*2.1-q*.55+4.); float mist=smoothstep(.25,.78,a*.65+b*.45);
   col=shadowColor*.12+primaryColor*a*.44+secondaryColor*b*.34+accentColor*mist*.2; alpha=.28+mist*.72;
 }else if(variant<2.5){
   float d=length(uv); vec2 p=uv*(2.15-energy*.08); vec2 q=vec2(fbm(p+vec2(t*.25,-t*.15)),fbm(p.yx+vec2(-t*.2,t*.18)))-.5;
   float a=fbm(p+q*.85),b=fbm(p*1.8-q*.5+5.); float body=smoothstep(.28,.72,a*.62+b*.48);
   col=shadowColor*.12+primaryColor*a*.42+secondaryColor*b*.38+accentColor*pow(body,4.)*(.18+energy*.45);
   alpha=(1.-smoothstep(.94,1.,d*1.35))*clamp(body*1.3,0.,1.);
 }else if(variant<3.5){
   float d=length(uv); vec2 p=uv*3.2; float n=fbm(p+vec2(t*.12,-t*.08));
   float r=1.-abs(fbm(p*1.5+(n-.5)*1.2)-.5)*2.; float vein=pow(clamp(r,0.,1.),6.-energy*1.5); float core=pow(clamp(r,0.,1.),15.);
   col=shadowColor*(.18+n*.24)+primaryColor*vein*.38+secondaryColor*vein*(.65+energy*.7)+accentColor*core*(.8+energy);
   alpha=(1.-smoothstep(.94,1.,d*1.35))*(.65+vein*.35);
 }else{
   vec2 p=uv*1.35; p.y+=.02; float open=energy*.085; float head=1.-smoothstep(.82,1.,length(vec2(p.x/.36,(p.y+.02)/.53)));
   float light=.24+.76*clamp(1.-length(p-vec2(-.18,-.22)),0.,1.);
   float eyes=max(bump(p,vec2(-.15,-.06),vec2(.055,.028)),bump(p,vec2(.15,-.06),vec2(.055,.028)));
   float nose=bump(p,vec2(0.,.08),vec2(.045,.16));
   float mouth=bump(p,vec2(0.,.31),vec2(.12,.018+open));
   col=mix(shadowColor,primaryColor,light)+secondaryColor*pow(1.-head,.8)*.4+primaryColor*nose*.18;
   col*=1.-eyes*.72-mouth*(.45+energy*.3); col+=accentColor*mouth*energy*.35;
   alpha=head*.95;
 }
 outColor=vec4(col*alpha,alpha);
}`;

type Palette = [string, string, string, string];
const palettes: Record<OrqestShaderKind, Record<'light'|'dark', Palette>> = {
  apparition: { light:['#263454','#7e98c4','#5c7eb6','#2e3e60'], dark:['#101a2e','#b0d0f8','#80b6f0','#466aa8'] },
};
const variants: Record<OrqestShaderKind, number> = {apparition:4};
const stateNumber: Record<VisualizerState, number> = {idle:0,listening:1,thinking:2,speaking:3,muted:-1};
const rgb=(hex:string):[number,number,number]=>[parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255];

export const OrqestShaderVisualizer: React.FC<Props> = ({kind,width,height,state,audioLevel,zcr=0,rmsHigh=0,backgroundColor}) => {
 const canvasRef=useRef<HTMLCanvasElement>(null); const values=useRef({state,audioLevel,zcr,rmsHigh,backgroundColor}); values.current={state,audioLevel,zcr,rmsHigh,backgroundColor};
 useEffect(()=>{const canvas=canvasRef.current,gl=canvas?.getContext('webgl2',{alpha:true,premultipliedAlpha:true});if(!canvas||!gl)return;
  const shader=(type:number,src:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'shader');return s};
  const program=gl.createProgram()!;gl.attachShader(program,shader(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const u=(n:string)=>gl.getUniformLocation(program,n); const start=performance.now();let frame=0;
  const draw=(now:number)=>{const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(width*dpr),h=Math.round(height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
   const v=values.current,dark=v.backgroundColor.toLowerCase()==='#000000'||document.documentElement.classList.contains('dark');const p=palettes[kind][dark?'dark':'light'];
   gl.uniform2f(u('resolution'),w,h);gl.uniform1f(u('time'),(now-start)/1000);gl.uniform1f(u('audio'),v.audioLevel);gl.uniform1f(u('articulation'),Math.max(v.zcr,v.rmsHigh));gl.uniform1f(u('stateIndex'),stateNumber[v.state]);gl.uniform1f(u('variant'),variants[kind]);
   (['shadowColor','primaryColor','secondaryColor','accentColor'] as const).forEach((name,i)=>gl.uniform3fv(u(name),rgb(p[i])));gl.drawArrays(gl.TRIANGLES,0,3);frame=requestAnimationFrame(draw)};frame=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(frame);gl.deleteProgram(program);gl.deleteBuffer(buffer)};
 },[kind,width,height]);
 return <canvas ref={canvasRef} aria-label={kind} style={{display:'block',width,height}}/>;
};
