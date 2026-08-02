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
type RGB = { r:number; g:number; b:number };
type Behavior = [number,number,number,number,number,number,number,number,number,number,number,number];

const rgb=(r:number,g:number,b:number):RGB=>({r,g,b});
const DARK=[rgb(255,100,120),rgb(100,200,255),rgb(180,120,255),rgb(120,255,200),rgb(255,200,80)];
const LIGHT=[rgb(220,60,80),rgb(40,140,220),rgb(140,70,220),rgb(30,180,130),rgb(220,160,30)];
const MUTED_DARK=[rgb(140,140,140),rgb(100,100,100),rgb(180,180,180),rgb(120,120,120),rgb(160,160,160)];
const MUTED_LIGHT=[rgb(170,170,170),rgb(140,140,140),rgb(200,200,200),rgb(155,155,155),rgb(185,185,185)];
const SIZE_RATIO:Record<VisualizerState,number>={idle:.22,listening:.22,thinking:.21,speaking:.23,muted:.20};
const BEHAVIOR:Record<VisualizerState,Behavior>={
  idle:[.6,20,.20,1,1.8,20,.03,.40,.8,25,0,0],
  listening:[.6,20,.20,1,1.8,20,.03,.40,.8,25,0,0],
  thinking:[.3,.5,.10,.05,3,6,.04,.03,1,2,1.2,.35],
  speaking:[.3,1,.08,.1,5,4,.10,.25,2,15,0,0],
  muted:[.4,.1,.30,.02,3,2,.015,.005,.3,.5,0,0],
};
const BLOB_COUNT=12,ANCHORS=14,LOBES=3;
const KAPPA=(4/3)*Math.tan(Math.PI/(2*ANCHORS));
const DEFORM_GAIN=1.5;

const expandColors=(base:RGB[]):RGB[]=>Array.from({length:BLOB_COUNT},(_,i)=>{
  const index=(i/BLOB_COUNT)*(base.length-1),lo=Math.floor(index),hi=Math.min(lo+1,base.length-1),f=index-lo,a=base[lo],b=base[hi];
  return rgb(a.r+(b.r-a.r)*f,a.g+(b.g-a.g)*f,a.b+(b.b-a.b)*f);
});
const palette=(dark:boolean,state:VisualizerState)=>expandColors(state==='muted'?(dark?MUTED_DARK:MUTED_LIGHT):(dark?DARK:LIGHT));

export const ColorfulBlobsVisualizer:React.FC<Props>=({width,height,state,audioLevel,zcr=0,rmsHigh=0,backgroundColor})=>{
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const input=useRef({state,audioLevel,zcr,rmsHigh,backgroundColor});
  input.current={state,audioLevel,zcr,rmsHigh,backgroundColor};

  useEffect(()=>{
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
    const random=()=>Math.random();
    const constants=Array.from({length:BLOB_COUNT},(_,i)=>({
      speedX:.6+random()*.6,speedY:.5+random()*.5,sizeScale:.65+random()*.35,
      orbitAngle:(i/BLOB_COUNT)*Math.PI*2+(random()-.5)*.3,orbitRadiusOffset:.8+random()*.4,
    }));
    const orders:number[]=[],amps:number[]=[],lobeSpeeds:number[]=[],phase0:number[]=[],wobble:number[]=[],wobbleRate:number[]=[],drift:number[]=[],ampRate:number[]=[],ampPhase0:number[]=[];
    for(let i=0;i<BLOB_COUNT;i++){
      const raw=[.35+random()*.25,.30+random()*.25,.15+random()*.15],sum=raw[0]+raw[1]+raw[2];
      for(let m=0;m<LOBES;m++){orders.push(m+1);amps.push(raw[m]/sum);lobeSpeeds.push(.5+random());phase0.push(random()*Math.PI*2);wobble.push(1.1+random()*1.2);wobbleRate.push(.7+random()*.8);drift.push((.04+random()*.10)*(random()<.5?-1:1));ampRate.push(.5+random()*.9);ampPhase0.push(random()*Math.PI*2);}
    }
    let ox=Array(BLOB_COUNT).fill(0),oy=Array(BLOB_COUNT).fill(0),vx=Array(BLOB_COUNT).fill(0),vy=Array(BLOB_COUNT).fill(0);
    let phaseX=constants.map((_,i)=>i*1.3+random()*Math.PI*2),phaseY=constants.map((_,i)=>i*.9+random()*Math.PI*2);
    let lobePhase=Array.from({length:BLOB_COUNT*LOBES},()=>random()*Math.PI*2);
    let radius=Math.min(width,height)*SIZE_RATIO[state],behavior=[...BEHAVIOR[state]],colors=palette(backgroundColor.toLowerCase()==='#000000',state);
    let smRms=0,smZcr=0,smHigh=0,time=0,last=performance.now(),previousState=state,frame=0;

    const draw=(now:number)=>{
      const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;time+=dt;
      const v=input.current,dark=v.backgroundColor.toLowerCase()==='#000000';
      smRms+=(v.audioLevel-smRms)*.5;smZcr+=(v.zcr-smZcr)*.4;smHigh+=(v.rmsHigh-smHigh)*.5;
      const zcrBoost=1+smZcr*2,highKick=smHigh;
      radius+=(Math.min(width,height)*SIZE_RATIO[v.state]-radius)*Math.min(1,dt*5);
      const targetBehavior=BEHAVIOR[v.state],behaviorT=Math.min(1,dt*3);behavior=behavior.map((n,i)=>n+(targetBehavior[i]-n)*behaviorT);
      const targetColors=palette(dark,v.state),stateChanged=previousState!==v.state,colorT=Math.min(1,dt*12);
      colors=colors.map((c,i)=>stateChanged?targetColors[i]:rgb(c.r+(targetColors[i].r-c.r)*colorT,c.g+(targetColors[i].g-c.g)*colorT,c.b+(targetColors[i].b-c.b)*colorT));previousState=v.state;
      const [moveSpeed,moveAudioMult,moveRange,moveRangeAudio,moveDamping,moveAccel,deformBase,deformAudio,deformSpeed,deformAudioSpeed,orbitSpeed,orbitRadius]=behavior;
      for(let i=0;i<BLOB_COUNT;i++){
        const c=constants[i],inv=1-c.sizeScale,speedMult=1+inv*2,rangeMult=1+inv*1.5;let targetX:number,targetY:number;
        if(orbitSpeed>.01){const a=c.orbitAngle+time*orbitSpeed*(.8+c.sizeScale*.4),r=orbitRadius*c.orbitRadiusOffset;targetX=Math.cos(a)*r;targetY=Math.sin(a)*r;}
        else{const speed=moveSpeed*speedMult+smRms*moveAudioMult*speedMult;phaseX[i]+=dt*c.speedX*speed*zcrBoost;phaseY[i]+=dt*c.speedY*speed*zcrBoost;const range=(moveRange+smRms*moveRangeAudio)*rangeMult+highKick*moveAudioMult*.05;targetX=Math.sin(phaseX[i])*range+Math.sin(phaseX[i]*1.7+i)*range*.3;targetY=Math.cos(phaseY[i])*range+Math.cos(phaseY[i]*1.3+i*.7)*range*.3;}
        const accel=moveAccel*(1+inv*1.5),ax=(targetX-ox[i])*accel-vx[i]*moveDamping,ay=(targetY-oy[i])*accel-vy[i]*moveDamping;vx[i]+=ax*dt;vy[i]+=ay*dt;ox[i]+=vx[i]*dt;oy[i]+=vy[i]*dt;
      }
      const phaseSpeed=deformSpeed+smRms*deformAudioSpeed+highKick*deformAudioSpeed*.5;for(let i=0;i<lobePhase.length;i++)lobePhase[i]+=dt*phaseSpeed*lobeSpeeds[i];
      const deform=deformBase+smRms*deformAudio+(zcrBoost-1)*deformAudio*.15+highKick*deformAudio*.2;
      const dpr=Math.min(devicePixelRatio||1,2),pixelW=Math.round(width*dpr),pixelH=Math.round(height*dpr);if(canvas.width!==pixelW||canvas.height!==pixelH){canvas.width=pixelW;canvas.height=pixelH;}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.globalCompositeOperation=dark?'screen':'multiply';
      const cx=width/2,cy=height/2,baseRadius=radius*.8,step=Math.PI*2/ANCHORS;
      for(let i=0;i<BLOB_COUNT;i++){
        const c=constants[i],blobRadius=baseRadius*c.sizeScale,blobCx=cx+ox[i]*radius*.8,blobCy=cy+oy[i]*radius*.8,effective=deform*(1+(1-c.sizeScale)*1.5)*DEFORM_GAIN,base=i*LOBES;
        const phaseNow:number[]=[],ampNow:number[]=[];for(let m=0;m<LOBES;m++){const li=base+m,tau=lobePhase[li];phaseNow[m]=phase0[li]+wobble[li]*Math.sin(tau*wobbleRate[li])+drift[li]*tau;ampNow[m]=amps[li]*(.25+.75*(.5+.5*Math.sin(tau*ampRate[li]+ampPhase0[li])));}
        const xs:number[]=[],ys:number[]=[],txs:number[]=[],tys:number[]=[];
        for(let k=0;k<ANCHORS;k++){const a=step*k,ca=Math.cos(a),sa=Math.sin(a);let sum=0,derivative=0;for(let m=0;m<LOBES;m++){const order=orders[base+m],arg=order*a+phaseNow[m];sum+=ampNow[m]*Math.sin(arg);derivative+=ampNow[m]*order*Math.cos(arg);}const rr=blobRadius*(1+sum*effective),dr=blobRadius*derivative*effective;xs[k]=blobCx+rr*ca;ys[k]=blobCy+rr*sa;txs[k]=dr*ca-rr*sa;tys[k]=dr*sa+rr*ca;}
        ctx.beginPath();ctx.moveTo(xs[0],ys[0]);for(let k=0;k<ANCHORS;k++){const next=(k+1)%ANCHORS;ctx.bezierCurveTo(xs[k]+KAPPA*txs[k],ys[k]+KAPPA*tys[k],xs[next]-KAPPA*txs[next],ys[next]-KAPPA*tys[next],xs[next],ys[next]);}ctx.closePath();ctx.fillStyle=`rgb(${Math.round(colors[i].r)},${Math.round(colors[i].g)},${Math.round(colors[i].b)})`;ctx.globalAlpha=.55+(1-c.sizeScale)*.25;ctx.fill();
      }
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';frame=requestAnimationFrame(draw);
    };
    frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
  },[width,height]);

  return <canvas ref={canvasRef} aria-label="Colorful Blobs" style={{display:'block',width,height}}/>;
};
