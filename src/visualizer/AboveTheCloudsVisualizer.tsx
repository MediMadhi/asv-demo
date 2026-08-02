import React, { useEffect, useRef } from 'react';
import type { VisualizerState } from './core/types';

type Props = {
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
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

// Direct GLSL ES 3.0 translation of Orqest's Above the Clouds SkSL.
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform vec2 center;
uniform float time;
uniform float audio;
uniform float attack;
uniform float zcr;
uniform float high;
uniform float scale;
uniform float maskRadius;
uniform float warpStrength;
uniform float densityThreshold;
uniform float verticalBias;
uniform float stateDrive;
uniform float fillMode;
uniform float bandInner;
uniform float bandOuter;
uniform float motionAmount;
uniform float layerFlowAmount;
uniform vec3 hazeColor;
uniform vec3 mistColor;
uniform vec3 inkA;
uniform vec3 inkB;
uniform vec3 inkC;
out vec4 outColor;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash21(i); float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)); float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5; vec2 shift = vec2(100.0);
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.02 + shift; a *= 0.5; }
  return v;
}
float waveField(vec2 p, float t, float amount) {
  float wave1 = sin((p.x * 3.4) + (t * 1.6));
  float wave2 = sin((p.y * 4.1) - (t * 1.15));
  float wave3 = sin(((p.x + p.y) * 2.6) + (t * 0.9));
  return (wave1 + wave2 + wave3) * 0.333333 * amount;
}
float densityLayer(vec2 p, vec2 offset, float threshold, float warpAmp, float timePhase) {
  vec2 warp = vec2(
    fbm(p * 1.1 + offset + vec2(timePhase * 0.53, -timePhase * 0.28)),
    fbm(p * 1.2 - offset + vec2(-timePhase * 0.31, timePhase * 0.46))
  ) - 0.5;
  vec2 q = p + warp * warpAmp;
  float low = fbm(q * 0.85 + offset);
  float wisps = fbm(q * 1.6 + vec2(offset.x * 1.7, offset.y * 0.8) + vec2(timePhase * 0.22, -timePhase * 0.17));
  float veins = fbm(q * 2.6 + vec2(7.3, 3.1) - vec2(timePhase * 0.08, timePhase * 0.14));
  float vSign = fillMode > 0.5 ? -1.0 : 1.0;
  float vertical = smoothstep(-0.12, 0.92 + verticalBias * 0.1, vSign * p.y * 0.5 + 0.5);
  float centerFade = 1.0 - smoothstep(0.45, 1.25, length(p * vec2(0.95, 1.12)));
  float d = vertical * 0.5 + centerFade * 0.14 + low * 0.46 + wisps * 0.26 + veins * 0.16 - threshold;
  return smoothstep(0.01, 0.28, d);
}
void main() {
  // Skia coordinates start at the top left; WebGL fragment coordinates start at the bottom left.
  vec2 xy = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y);
  vec2 uv = (xy - center) / max(scale, 1.0); uv.y *= 1.08;
  float distFromCenter = length(xy - center);
  float mask; float upperFloor = 0.0; vec3 deepColor = vec3(0.0);
  if (fillMode > 0.5) {
    float ay = uv.y;
    if (ay >= 0.0) {
      mask = 1.0 - smoothstep(bandInner, bandOuter, ay);
      if (mask <= 0.002) { outColor = vec4(0.0); return; }
    } else {
      deepColor = hazeColor * 0.03 + inkA * 0.28 + inkB * 0.24 + inkC * 0.2 + mistColor * 0.18;
      if (ay < -bandOuter) { outColor = vec4(deepColor, 0.68); return; }
      mask = 1.0; upperFloor = smoothstep(0.0, bandOuter, -ay);
    }
  } else {
    mask = 1.0 - smoothstep(maskRadius * 0.96, maskRadius, distFromCenter);
  }
  float circleMask = mask; float t = time;
  float motionBoost = audio * 0.75 + attack * 1.3 + high * 0.35 + zcr * 0.22 + stateDrive;
  vec2 swirl = vec2(
    fbm(uv * 0.55 + vec2(t * 0.18, -t * 0.11)),
    fbm(uv.yx * 0.58 + vec2(-t * 0.14, t * 0.16))
  ) - 0.5;
  vec2 attackMix = vec2(
    fbm((uv * 1.9) + vec2(t * 0.8, -t * 0.62)),
    fbm((uv.yx * 2.1) + vec2(-t * 0.74, t * 0.68))
  ) - 0.5;
  vec2 layerDriftA = vec2(sin(t * 0.78), cos(t * 0.66)) * (0.012 + motionBoost * 0.028);
  vec2 layerDriftB = vec2(cos(t * 0.92), -sin(t * 0.84)) * (0.018 + motionBoost * 0.04);
  vec2 layerDriftC = vec2(-sin(t * 1.08), cos(t * 0.98)) * (0.024 + motionBoost * 0.05);
  vec2 advectedUv = uv + swirl * (0.14 + motionBoost * 0.035) * motionAmount * 0.35;
  advectedUv += attackMix * (attack * 0.18 + audio * 0.025);
  vec2 swRot = vec2(-swirl.y, swirl.x); vec2 amRot = vec2(-attackMix.y, attackMix.x);
  float layerFlow = (0.10 + motionBoost * 0.03) * motionAmount * layerFlowAmount;
  vec2 flowA = (swirl * (0.9 + 0.6 * sin(t * 0.23)) + amRot * (0.5 + 0.4 * cos(t * 0.37 + 0.9))) * layerFlow * 1.5;
  vec2 flowB = (swRot * (0.8 + 0.6 * cos(t * 0.19)) + attackMix * (0.6 + 0.4 * sin(t * 0.29 + 2.3))) * layerFlow * 0.9;
  vec2 flowC = (swirl * (-0.7 - 0.5 * sin(t * 0.17 + 4.1)) + amRot * (0.7 + 0.5 * sin(t * 0.31 + 1.7))) * layerFlow * 0.45;
  float edgeNoiseA = fbm((advectedUv + layerDriftA) * 1.22 + vec2(t * 0.62, -t * 0.46)) - 0.5;
  float edgeNoiseB = fbm((advectedUv + layerDriftB) * 1.34 + vec2(-t * 0.30, t * 0.24)) - 0.5;
  float edgeNoiseC = fbm((advectedUv + layerDriftC) * 1.48 + vec2(t * 0.11, t * 0.13)) - 0.5;
  float boundaryWave = waveField(advectedUv * vec2(1.4, 1.1), t, 0.05 + audio * 0.12 + attack * 0.05);
  float warpAmp = warpStrength * (1.0 + audio * 0.28 + high * 0.14 + attack * 0.6) * motionAmount;
  float thresholdA = densityThreshold + boundaryWave + edgeNoiseA * (0.045 + motionBoost * 0.028) - audio * 0.012;
  float thresholdB = densityThreshold + 0.02 + boundaryWave * 0.82 + edgeNoiseB * (0.055 + motionBoost * 0.035) - attack * 0.016;
  float thresholdC = densityThreshold + 0.05 + boundaryWave * 0.68 + edgeNoiseC * (0.065 + motionBoost * 0.04) - high * 0.014;
  float dA = densityLayer(advectedUv + layerDriftA + flowA, vec2(0.0), thresholdA, warpAmp, t * 2.1);
  float dB = densityLayer(advectedUv + vec2(0.12, -0.06) + layerDriftB + flowB, vec2(3.1, 1.7), thresholdB, warpAmp * 0.96, t + 1.7);
  float dC = densityLayer(advectedUv + vec2(-0.09, 0.04) + layerDriftC + flowC, vec2(5.4, -2.3), thresholdC, warpAmp, t * 0.35 + 3.4);
  float haze = 1.0 - smoothstep(0.7, 1.55, length((advectedUv + layerDriftA * 0.35) * vec2(0.92, 1.08)));
  float mist = fbm(advectedUv * 0.7 + vec2(t * 0.24, -t * 0.19) + layerDriftC * 0.38);
  float densityMax = max(max(dA, dB), dC);
  float fringe = smoothstep(0.1, 0.46, dA + dB + dC) * (1.0 - smoothstep(0.42, 0.86, densityMax));
  float fringeNoise = fbm(advectedUv * 1.7 + vec2(-t * 0.44, t * 0.33));
  vec3 color = hazeColor * (haze * 0.12 + mist * 0.06);
  color += inkA * dA * 0.28 + inkB * dB * 0.24 + inkC * dC * 0.2;
  color += mistColor * ((dA + dB + dC) * 0.06);
  color += mistColor * fringe * (0.08 + fringeNoise * 0.06);
  float alpha = clamp(densityMax * 0.68 + haze * 0.08 + fringe * 0.08, 0.0, 0.92) * circleMask;
  if (upperFloor > 0.0) { color = mix(color, deepColor, upperFloor); alpha = mix(alpha, 0.68, upperFloor); outColor = vec4(color, alpha); return; }
  outColor = vec4(color * circleMask, alpha);
}`;

type Palette = { haze:number[]; mist:number[]; inks:number[][] };
const normalLight:Palette={haze:[212,230,255],mist:[255,248,236],inks:[[12,96,255],[39,176,255],[121,113,255]]};
const mutedLight:Palette={haze:[226,232,241],mist:[247,245,242],inks:[[118,130,160],[145,156,180],[101,115,144]]};
const normalDark:Palette={haze:[41,59,96],mist:[132,146,178],inks:[[48,74,132],[52,104,150],[86,76,138]]};
const mutedDark:Palette={haze:[52,58,72],mist:[116,122,134],inks:[[62,68,82],[74,80,94],[56,62,76]]};
const behavior:Record<VisualizerState,number[]>={idle:[.42,.18,.48,.73],listening:[.42,.18,.48,.73],thinking:[1.02,.38,.468,.68],speaking:[.88,.34,.435,.80],muted:[.26,.08,.55,.62]};
const stateNum=(s:VisualizerState)=>s==='thinking'?1:s==='speaking'?2:s==='muted'?3:0;
const normalize=(v:number[])=>v.map(n=>n/255);

export const AboveTheCloudsVisualizer:React.FC<Props>=({width,height,state,audioLevel,zcr=0,rmsHigh=0,backgroundColor})=>{
 const canvasRef=useRef<HTMLCanvasElement>(null); const input=useRef({state,audioLevel,zcr,rmsHigh,backgroundColor});input.current={state,audioLevel,zcr,rmsHigh,backgroundColor};
 useEffect(()=>{const canvas=canvasRef.current;const gl=canvas?.getContext('webgl2',{alpha:true,premultipliedAlpha:false});if(!canvas||!gl)return;
  const compile=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Above the Clouds shader error');return s};
  const program=gl.createProgram()!;gl.attachShader(program,compile(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Above the Clouds link error');gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);const u=(name:string)=>gl.getUniformLocation(program,name);
  const initialDark=input.current.backgroundColor.toLowerCase()==='#000000';const initialPalette=input.current.state==='muted'?(initialDark?mutedDark:mutedLight):(initialDark?normalDark:normalLight);
  let frame=0,last=performance.now(),phase=0,motionRms=0,prevMotionRms=0,motionZcr=0,motionHigh=0;let currentBehavior=[...behavior[state]];let currentPalette=[...initialPalette.haze,...initialPalette.mist,...initialPalette.inks.flat()];
  const draw=(now:number)=>{const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;const v=input.current;const dark=v.backgroundColor.toLowerCase()==='#000000';const targetPalette=(v.state==='muted'?(dark?mutedDark:mutedLight):(dark?normalDark:normalLight));const target=[...targetPalette.haze,...targetPalette.mist,...targetPalette.inks.flat()];const pt=Math.min(1,dt*8);currentPalette=currentPalette.map((n,i)=>n+(target[i]-n)*pt);const bt=Math.min(1,dt*4),tb=behavior[v.state];currentBehavior=currentBehavior.map((n,i)=>n+(tb[i]-n)*bt);
   const release=1-Math.exp(-dt/.85);prevMotionRms=motionRms;motionRms+=(v.audioLevel-motionRms)*(v.audioLevel>motionRms?1:release);motionZcr+=(v.zcr-motionZcr)*(v.zcr>motionZcr?.68:release);motionHigh+=(v.rmsHigh-motionHigh)*(v.rmsHigh>motionHigh?.72:release);const attack=Math.max(0,motionRms-prevMotionRms);const sn=stateNum(v.state),active=sn===0||sn===2;const a=active?motionRms:0,at=active?attack:0,z=active?motionZcr:0,h=active?motionHigh:0;const audioPart=a*2.4+at*8.5+h*.9+z*.55;phase+=dt*currentBehavior[0]*1.25*(1+(sn===1?1.45:0)+audioPart);
   const dpr=Math.min(devicePixelRatio||1,2),renderScale=.6,w=Math.max(1,Math.round(width*dpr*renderScale)),hh=Math.max(1,Math.round(height*dpr*renderScale));if(canvas.width!==w||canvas.height!==hh){canvas.width=w;canvas.height=hh;}gl.viewport(0,0,w,hh);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);const set1=(n:string,x:number)=>gl.uniform1f(u(n),x),set3=(n:string,x:number[])=>gl.uniform3fv(u(n),new Float32Array(normalize(x)));
   gl.uniform2f(u('resolution'),w,hh);gl.uniform2f(u('center'),w/2,hh/2);set1('time',phase);set1('audio',a);set1('attack',at);set1('zcr',z);set1('high',h);set1('scale',Math.min(width,height)*dpr*.205*renderScale);set1('maskRadius',Math.min(width,height)*dpr*.205*1.22*renderScale);set1('warpStrength',currentBehavior[1]);set1('densityThreshold',currentBehavior[2]);set1('verticalBias',currentBehavior[3]);set1('stateDrive',sn===1?.9:0);set1('fillMode',1);set1('bandInner',1.15);set1('bandOuter',2.1);set1('motionAmount',1.6);set1('layerFlowAmount',4.5);set3('hazeColor',currentPalette.slice(0,3));set3('mistColor',currentPalette.slice(3,6));set3('inkA',currentPalette.slice(6,9));set3('inkB',currentPalette.slice(9,12));set3('inkC',currentPalette.slice(12,15));gl.drawArrays(gl.TRIANGLES,0,3);frame=requestAnimationFrame(draw)};
  frame=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(frame);gl.deleteProgram(program);gl.deleteBuffer(buffer)};
 },[width,height]);
 const dark=backgroundColor.toLowerCase()==='#000000';return <canvas ref={canvasRef} aria-label="Above the Clouds" style={{display:'block',width,height,mixBlendMode:dark?'screen':'multiply'}}/>;
};
