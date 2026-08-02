/**
 * Orbital Particles for Web
 *
 * OrqestのReact Native/Skia版と同じ320粒子・状態別モーション・遷移式を、
 * HTML Canvasへ移植したWeb展示版。
 */

import React, { useEffect, useRef } from 'react';
import type { ParticleVisualizerProps, VisualizerState } from './core/types';

const PARTICLE_COUNT = 320;
const DOT_DIAMETER = 3.2;
const TRANSITION_MS = 650;
const MERIHARI_TRANSITION = true;
const STAGGER_SPREAD = 0;
const BACK_OVERSHOOT = 1.2;
const CALM_HOLD_MS = 380;

const makeRandomArray = (n: number, lo: number, hi: number): number[] =>
  Array.from({ length: n }, () => lo + Math.random() * (hi - lo));

// Orqest版と同様、再マウントしても回転位相と粒子配置を維持する。
let persistentClock = 0;
const persistentRndDisp = makeRandomArray(PARTICLE_COUNT, -1, 1);
const persistentRndPhase = makeRandomArray(PARTICLE_COUNT, 0, 1);

// 0=listening / 1=thinking / 2=speaking / 3=muted / 4=idle
const stateToNum = (state: VisualizerState): number =>
  state === 'thinking' ? 1 : state === 'speaking' ? 2 : state === 'muted' ? 3 : state === 'idle' ? 4 : 0;

interface RuntimeState {
  current: number;
  previous: number;
  blend: number;
  transitionStartedAt: number;
  pendingTarget: number;
  pendingSince: number;
  smoothedRms: number;
  smoothedZcr: number;
  smoothedHigh: number;
}

export const ParticleVisualizerWeb: React.FC<ParticleVisualizerProps> = ({
  audioLevel,
  zcr = 0,
  rmsHigh = 0,
  state,
  transcript,
  userTranscript,
  showCaption = true,
  config,
  width,
  height,
  particleColor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioLevelRef = useRef(audioLevel);
  const zcrRef = useRef(zcr);
  const rmsHighRef = useRef(rmsHigh);
  const requestedStateRef = useRef(stateToNum(state));
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  const colorRef = useRef(particleColor ?? config?.particleColor ?? '#FFFFFF');
  const initialState = stateToNum(state);
  const runtimeRef = useRef<RuntimeState>({
    current: initialState,
    previous: initialState,
    blend: 1,
    transitionStartedAt: -1,
    pendingTarget: initialState,
    pendingSince: persistentClock,
    smoothedRms: 0,
    smoothedZcr: 0,
    smoothedHigh: 0,
  });

  audioLevelRef.current = audioLevel;
  zcrRef.current = zcr;
  rmsHighRef.current = rmsHigh;
  requestedStateRef.current = stateToNum(state);
  widthRef.current = width;
  heightRef.current = height;
  colorRef.current = particleColor ?? config?.particleColor ?? '#FFFFFF';

  useEffect(() => {
    let animationFrame = 0;
    let lastFrameTime: number | null = null;
    const currentPosition = { x: 0, y: 0 };
    const previousPosition = { x: 0, y: 0 };

    const animate = (frameTime: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const frameDelta = lastFrameTime === null ? 16.7 : frameTime - lastFrameTime;
      lastFrameTime = frameTime;
      persistentClock += Math.min(64, Math.max(0, frameDelta));
      const time = persistentClock;
      const runtime = runtimeRef.current;

      // speaking直後の短い状態揺れを吸収するOrqest版と同じヒステリシス。
      const requested = requestedStateRef.current;
      if (requested !== runtime.current) {
        if (requested !== runtime.pendingTarget) {
          runtime.pendingTarget = requested;
          runtime.pendingSince = time;
        }
        const leavingSpeaking = runtime.current === 2 && requested !== 2;
        const held = time - runtime.pendingSince >= CALM_HOLD_MS;
        if (!leavingSpeaking || held) {
          runtime.previous = runtime.current;
          runtime.current = requested;
          runtime.blend = 0;
          runtime.transitionStartedAt = -1;
        }
      } else {
        runtime.pendingTarget = requested;
      }

      if (runtime.blend < 1) {
        if (runtime.transitionStartedAt < 0) runtime.transitionStartedAt = time;
        runtime.blend = Math.min(1, (time - runtime.transitionStartedAt) / TRANSITION_MS);
      }

      const width = widthRef.current;
      const height = heightRef.current;
      const centerX = width / 2;
      const centerY = height / 2;
      const minDimension = Math.min(width, height);

      const smoothing = 0.3;
      runtime.smoothedRms += (audioLevelRef.current - runtime.smoothedRms) * smoothing;
      runtime.smoothedZcr += (zcrRef.current - runtime.smoothedZcr) * smoothing;
      runtime.smoothedHigh += (rmsHighRef.current - runtime.smoothedHigh) * smoothing;
      const rms = runtime.smoothedRms;
      const zc = runtime.smoothedZcr;
      const high = runtime.smoothedHigh;

      const position = (visualizerState: number, index: number, output: { x: number; y: number }) => {
        const angleBase = (index / PARTICLE_COUNT) * Math.PI * 2;

        if (visualizerState === 1) {
          const baseRadius = minDimension / 7;
          const breath = 1 + 0.03 * Math.sin(time * 2.0 * 0.001);
          const raw = (persistentRndDisp[index] + 1) * 0.5;
          const fraction = Math.pow(raw, 2.6);
          const innerRadius = baseRadius * 0.5;
          const ringWidth = baseRadius * 1.3;
          const individualFreqX = 0.0008 + (index % 7) * 0.0002;
          const individualFreqY = 0.0007 + (index % 5) * 0.00025;
          const randomPhase = persistentRndPhase[index];
          let radius: number;
          let rotationSpeed: number;
          let wanderAmount: number;

          if (randomPhase > 0.97) {
            const outlier = (randomPhase - 0.97) / 0.03;
            radius = baseRadius * (1.5 + outlier * 0.8) * breath;
            rotationSpeed = 0.0028 * 0.1;
            wanderAmount = baseRadius * 0.14;
          } else {
            radius = (innerRadius + fraction * ringWidth) * breath;
            const inward = 1 - fraction;
            rotationSpeed = 0.0028 * (0.15 + inward * inward * inward * 14.0);
            wanderAmount = baseRadius * 0.04;
          }

          const angle = angleBase + time * rotationSpeed;
          const offsetX = Math.sin(time * individualFreqX + index * 1.3) * wanderAmount;
          const offsetY = Math.cos(time * individualFreqY + index * 0.9) * wanderAmount;
          output.x = centerX + Math.cos(angle) * radius + offsetX;
          output.y = centerY + Math.sin(angle) * radius + offsetY;
        } else if (visualizerState === 2) {
          const baseRadius = minDimension / 5;
          const outward = baseRadius * 0.9 * rms;
          const currentRadius = baseRadius + outward;
          const globalBreath = Math.sin(time * 0.0008) * (baseRadius * 0.03 * (1 + rms * 1.5));
          const angle = angleBase + time * 0.0003;
          const shape =
            Math.sin(angleBase * 2 + time * 0.0009) * 0.11 +
            Math.sin(angleBase * 3 - time * 0.0006 + 1.7) * 0.07 +
            Math.sin(angleBase * 5 + time * 0.0013 + 0.6) * 0.035;
          const shapeAmount = baseRadius * shape * (0.35 + rms * 2.6);
          const frequencyMultiplier = 0.004 + zc * 0.015 + (index % 7) * 0.0008;
          const individualAmplitude = baseRadius * 0.05 * (rms * 4.0 + high * 1.5);
          const particleNoise = Math.sin(time * frequencyMultiplier + index * 1.2) * individualAmplitude;
          const radius = Math.max(0, currentRadius + globalBreath + shapeAmount + particleNoise);
          output.x = centerX + Math.cos(angle) * radius;
          output.y = centerY + Math.sin(angle) * radius;
        } else if (visualizerState === 3) {
          const baseRadius = minDimension / 6;
          const currentRadius = baseRadius * (1 + Math.sin(time * 0.001 * 1.5) * 0.15);
          const angle = angleBase + time * 0.0002;
          const dispersion = persistentRndDisp[index] * (baseRadius * 0.3);
          const individualFreqX = 0.0008 + (index % 7) * 0.0002;
          const individualFreqY = 0.0007 + (index % 5) * 0.00025;
          const wanderAmount = baseRadius * 0.15;
          const offsetX = Math.sin(time * individualFreqX + index * 1.3) * wanderAmount;
          const offsetY = Math.cos(time * individualFreqY + index * 0.9) * wanderAmount;
          output.x = centerX + Math.cos(angle) * (currentRadius + dispersion) + offsetX;
          output.y = centerY + Math.sin(angle) * (currentRadius + dispersion) + offsetY;
        } else if (visualizerState === 4) {
          const baseRadius = minDimension / 4;
          const currentRadius = baseRadius * (1 + Math.sin(time * 0.0006) * 0.03);
          const rotation = time * -0.0003;
          const individualFreqX = 0.0008 + (index % 7) * 0.0002;
          const individualFreqY = 0.0007 + (index % 5) * 0.00025;
          const wanderAmount = baseRadius * 0.08;
          const offsetX = Math.sin(time * individualFreqX + index * 1.3) * wanderAmount;
          const offsetY = Math.cos(time * individualFreqY + index * 0.9) * wanderAmount;
          const randomPhase = persistentRndPhase[index];
          let radius: number;
          let angle = angleBase + rotation;

          if (randomPhase > 0.95) {
            const outlier = (randomPhase - 0.95) / 0.05;
            const speedSeed = (persistentRndDisp[index] + 1) * 0.5;
            const radialFrequency = 0.0002 + speedSeed * speedSeed * 0.004;
            const radialAmplitude = baseRadius * (0.5 + outlier * 0.4);
            radius = currentRadius + Math.sin(time * radialFrequency + index * 2.1) * radialAmplitude;
            const rotationMultiplier = 0.6 + outlier * outlier * 8.4;
            const rotationDirection = outlier > 0.55 ? -1 : 1;
            angle = angleBase + rotation * rotationMultiplier * rotationDirection;
          } else {
            radius = currentRadius + persistentRndDisp[index] * (baseRadius * 0.15);
            const normalized = randomPhase / 0.95;
            angle = angleBase + rotation * (0.85 + normalized * normalized * normalized * 3.65);
          }

          output.x = centerX + Math.cos(angle) * radius + offsetX;
          output.y = centerY + Math.sin(angle) * radius + offsetY;
        } else {
          const baseRadius = minDimension / 4;
          const inward = baseRadius * 1.5 * rms * 2.0;
          const currentRadius = Math.max(baseRadius * 0.35, baseRadius - inward);
          const globalBreath = Math.sin(time * 0.0008) * (baseRadius * 0.03 * (1 + rms * 1.5));
          const angle = angleBase + time * -0.0003;
          const frequencyMultiplier = 0.004 + zc * 0.04 + (index % 7) * 0.0008;
          const individualAmplitude = baseRadius * 0.04 * (rms * 4.0 + high * 5.0);
          const particleNoise = Math.sin(time * frequencyMultiplier + index * 1.2) * individualAmplitude;
          const radius = Math.max(0, currentRadius + globalBreath + particleNoise);
          output.x = centerX + Math.cos(angle) * radius;
          output.y = centerY + Math.sin(angle) * radius;
        }
      };

      const context = canvas.getContext('2d');
      if (!context) return;
      const dpr = window.devicePixelRatio || 1;
      const physicalWidth = Math.max(1, Math.round(width * dpr));
      const physicalHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
        canvas.width = physicalWidth;
        canvas.height = physicalHeight;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = colorRef.current;
      context.globalAlpha = 0.5;
      context.beginPath();

      const linearBlend = runtime.blend;
      const smoothBlend = linearBlend * linearBlend * (3 - 2 * linearBlend);
      const backCoefficient = BACK_OVERSHOOT * 1.525;
      const inverseSpread = 1 / (1 - STAGGER_SPREAD);
      const dotRadius = DOT_DIAMETER / 2;

      for (let index = 0; index < PARTICLE_COUNT; index++) {
        position(runtime.current, index, currentPosition);
        let x = currentPosition.x;
        let y = currentPosition.y;

        if (linearBlend < 1) {
          position(runtime.previous, index, previousPosition);
          let blendValue: number;
          if (MERIHARI_TRANSITION) {
            const stagger = (index / PARTICLE_COUNT) * STAGGER_SPREAD;
            const local = Math.min(1, Math.max(0, (linearBlend - stagger) * inverseSpread));
            blendValue = local < 0.5
              ? (Math.pow(2 * local, 2) * ((backCoefficient + 1) * 2 * local - backCoefficient)) / 2
              : (Math.pow(2 * local - 2, 2) * ((backCoefficient + 1) * (2 * local - 2) + backCoefficient) + 2) / 2;
          } else {
            blendValue = smoothBlend;
          }
          x = previousPosition.x + (currentPosition.x - previousPosition.x) * blendValue;
          y = previousPosition.y + (currentPosition.y - previousPosition.y) * blendValue;
        }

        context.moveTo(x + dotRadius, y);
        context.arc(x, y, dotRadius, 0, Math.PI * 2);
      }

      context.fill();
      context.globalAlpha = 1;
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const color = particleColor ?? config?.particleColor ?? '#FFFFFF';
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const captionContainerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: isMobile ? 10 : 20,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: isMobile ? 'flex-start' : 'center',
    gap: isMobile ? 4 : 8,
    padding: '0 20px',
    pointerEvents: 'none',
  };
  const userTranscriptStyle: React.CSSProperties = {
    fontSize: isMobile ? 11 : 14,
    color,
    opacity: 0.6,
    textAlign: isMobile ? 'left' : 'center',
    textShadow: `0 0 4px ${color === '#FFFFFF' ? '#000' : '#FFF'}`,
  };
  const transcriptStyle: React.CSSProperties = {
    fontSize: isMobile ? 14 : 18,
    fontWeight: 600,
    color,
    textAlign: isMobile ? 'left' : 'center',
    textShadow: `0 0 6px ${color === '#FFFFFF' ? '#000' : '#FFF'}`,
    maxWidth: isMobile ? '95%' : '90%',
  };

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas ref={canvasRef} style={{ width, height, display: 'block' }} />
      {showCaption && (userTranscript || transcript) && (
        <div style={captionContainerStyle}>
          {userTranscript && <div style={userTranscriptStyle}>{userTranscript}</div>}
          {transcript && <div style={transcriptStyle}>{transcript}</div>}
        </div>
      )}
    </div>
  );
};

export default ParticleVisualizerWeb;
