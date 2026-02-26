/**
 * Particle Visualizer for Web
 *
 * HTML5 Canvas APIを使用したパーティクル描画コンポーネント
 */

import React, { useEffect, useRef, useCallback } from 'react';
import type {
  VisualizerState,
  ParticleVisualizerProps,
  AudioFeatures,
  Particle,
} from './core/types';
import { DEFAULT_VISUALIZER_CONFIG } from './core/types';
import { ParticleSystem } from './core/ParticleSystem';
import { TransitionManager } from './core/TransitionManager';

export const ParticleVisualizerWeb: React.FC<ParticleVisualizerProps> = ({
  audioLevel,
  zcr = 0,
  rmsHigh = 0,
  state,
  transcript,
  userTranscript,
  showCaption = true,
  config: userConfig,
  width,
  height,
  particleColor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const config = { ...DEFAULT_VISUALIZER_CONFIG, ...userConfig };

  // パーティクルシステムとトランジションマネージャー
  const particleSystemRef = useRef<ParticleSystem | null>(null);
  const transitionManagerRef = useRef<TransitionManager | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());
  const prevStateRef = useRef<VisualizerState>(state);

  // audioLevel等の最新値を保持
  const audioLevelRef = useRef<number>(audioLevel);
  audioLevelRef.current = audioLevel;
  const zcrRef = useRef<number>(zcr);
  zcrRef.current = zcr;
  const rmsHighRef = useRef<number>(rmsHigh);
  rmsHighRef.current = rmsHigh;

  // 描画色をrefで管理（アニメーションループ内で最新値を参照するため）
  const color = particleColor || config.particleColor;
  const colorRef = useRef<string>(color);
  colorRef.current = color;

  // width/heightをrefで管理（アニメーションループ内で最新値を参照するため）
  const widthRef = useRef<number>(width);
  widthRef.current = width;
  const heightRef = useRef<number>(height);
  heightRef.current = height;

  // 初期化
  useEffect(() => {
    const particleSystem = new ParticleSystem(config);
    const transitionManager = new TransitionManager(particleSystem, {
      transition: config.transition,
      particleSize: config.particleSize,
      radiusDispersion: config.radiusDispersion,
    });

    particleSystemRef.current = particleSystem;
    transitionManagerRef.current = transitionManager;

    // パーティクルを初期化
    const initialCount = config.listening.particleCount;
    particleSystem.initialize(initialCount, width / 2, height / 2);

    // 画面サイズを設定
    transitionManager.setDimensions(width, height);

    // 初期状態を設定
    transitionManager.initialize(state);

    // アニメーションループ
    const animate = () => {
      const now = Date.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (transitionManagerRef.current && particleSystemRef.current) {
        const audio: AudioFeatures = {
          rms: audioLevelRef.current,
          peak: audioLevelRef.current,
          timestamp: now,
          zcr: zcrRef.current,
          rmsHigh: rmsHighRef.current,
        };

        transitionManagerRef.current.update(dt, audio, now);

        // Canvas描画
        draw(particleSystemRef.current.getParticles());
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      transitionManager.dispose();
      particleSystem.dispose();
    };
  }, []);

  // 画面サイズの変更に対応
  useEffect(() => {
    if (transitionManagerRef.current) {
      transitionManagerRef.current.setDimensions(width, height);
    }
  }, [width, height]);

  // 状態変更の検出と遷移開始
  useEffect(() => {
    if (prevStateRef.current !== state && transitionManagerRef.current) {
      transitionManagerRef.current.transitionTo(state, Date.now());
      prevStateRef.current = state;
    }
  }, [state]);

  // Canvas描画関数（refから最新値を取得）
  const draw = useCallback((particles: Particle[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // refから最新のwidth/heightを取得
    const currentWidth = widthRef.current;
    const currentHeight = heightRef.current;

    // Retinaディスプレイ対応
    const dpr = window.devicePixelRatio || 1;
    canvas.width = currentWidth * dpr;
    canvas.height = currentHeight * dpr;
    ctx.scale(dpr, dpr);

    // クリア
    ctx.clearRect(0, 0, currentWidth, currentHeight);

    // パーティクル描画（colorRefから最新の色を取得）
    const currentColor = colorRef.current;
    particles.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = currentColor;
      ctx.globalAlpha = p.opacity;
      ctx.fill();
    });

    ctx.globalAlpha = 1;
  }, []);

  // 字幕のスタイル
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
    color: color,
    opacity: 0.6,
    textAlign: isMobile ? 'left' : 'center',
    textShadow: `0 0 4px ${color === '#FFFFFF' ? '#000' : '#FFF'}`,
  };

  const transcriptStyle: React.CSSProperties = {
    fontSize: isMobile ? 14 : 18,
    fontWeight: 600,
    color: color,
    textAlign: isMobile ? 'left' : 'center',
    textShadow: `0 0 6px ${color === '#FFFFFF' ? '#000' : '#FFF'}`,
    maxWidth: isMobile ? '95%' : '90%',
  };

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas
        ref={canvasRef}
        style={{
          width,
          height,
          display: 'block',
        }}
      />
      {showCaption && (userTranscript || transcript) && (
        <div style={captionContainerStyle}>
          {userTranscript && (
            <div style={userTranscriptStyle}>{userTranscript}</div>
          )}
          {transcript && (
            <div style={transcriptStyle}>{transcript}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default ParticleVisualizerWeb;
