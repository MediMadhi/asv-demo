import React, { useEffect, useRef } from 'react';
import type { VisualizerState } from './core/types';

type Props={width:number;height:number;state:VisualizerState;audioLevel:number;zcr?:number;rmsHigh?:number;backgroundColor:string};
const palettes={
 light:['#3578f6','#17b8cc','#9a68ef','#f15c8a','#f2a33c'],
 dark:['#76a7ff','#51d4e7','#bd91ff','#ff7eaa','#ffc267'],
};
const stateSpeed:Record<VisualizerState,number>={idle:.35,listening:.75,thinking:1.1,speaking:.9,muted:.16};

export const ColorfulBlobsVisualizer:React.FC<Props>=({width,height,state,audioLevel,zcr=0,rmsHigh=0,backgroundColor})=>{
 const ref=useRef<HTMLCanvasElement>(null);const values=useRef({state,audioLevel,zcr,rmsHigh,backgroundColor});values.current={state,audioLevel,zcr,rmsHigh,backgroundColor};
 useEffect(()=>{const canvas=ref.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;let frame=0;const start=performance.now();
  const draw=(now:number)=>{const dpr=Math.min(devicePixelRatio||1,2),w=Math.round(width*dpr),h=Math.round(height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.clearRect(0,0,w,h);const v=values.current,dark=v.backgroundColor.toLowerCase()==='#000000',colors=palettes[dark?'dark':'light'],t=(now-start)/1000*stateSpeed[v.state],energy=Math.min(1.4,v.audioLevel*1.35+Math.max(v.zcr,v.rmsHigh)*.25);ctx.save();ctx.scale(dpr,dpr);ctx.globalCompositeOperation=dark?'screen':'multiply';
   for(let i=0;i<12;i++){const phase=i*2.399+t*(.55+(i%4)*.09),orbit=Math.min(width,height)*(.13+(i%5)*.035),cx=width/2+Math.cos(phase)*orbit,cy=height/2+Math.sin(phase*.83)*orbit*.82,r=Math.min(width,height)*(.105+(i%4)*.022)*(1+energy*(i%3===0?.28:.12));const points=10;ctx.beginPath();for(let j=0;j<=points;j++){const a=j/points*Math.PI*2,rr=r*(1+.15*Math.sin(a*3+t+i)+.09*Math.cos(a*5-t*1.4));const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr;if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();const g=ctx.createRadialGradient(cx-r*.25,cy-r*.3,r*.05,cx,cy,r*1.1);g.addColorStop(0,colors[i%colors.length]+'d9');g.addColorStop(1,colors[(i+2)%colors.length]+'24');ctx.fillStyle=g;ctx.filter=`blur(${Math.max(2,r*.08)}px)`;ctx.fill();}ctx.restore();frame=requestAnimationFrame(draw)};frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
 },[width,height]);
 return <canvas ref={ref} aria-label="Colorful Blobs" style={{display:'block',width,height}}/>;
};
