/**
 * Floating Particles Visualizer for Web
 *
 * 大量パーティクル対応版ビジュアライザー
 * デフォルト500個のパーティクルで、より豊かな表現を実現
 */

import React, { useEffect, useRef, useCallback } from 'react';
import type {
  VisualizerState,
  ParticleVisualizerProps,
  AudioFeatures,
  Particle,
  VisualizerConfig,
} from './core/types';
import { DEFAULT_VISUALIZER_CONFIG } from './core/types';
import { ParticleSystem } from './core/ParticleSystem';
import { TransitionManager } from './core/TransitionManager';

// Floating Particles用のデフォルト設定（500パーティクル）
const FLOATING_PARTICLES_CONFIG: VisualizerConfig = {
  ...DEFAULT_VISUALIZER_CONFIG,
  listening: {
    ...DEFAULT_VISUALIZER_CONFIG.listening,
    particleCount: 500,  // 40 -> 500
    maxAmplitude: 400,   // 振幅を少し抑える
    noiseScale: 0.25,    // ノイズを少し滑らかに
  },
  thinking: {
    ...DEFAULT_VISUALIZER_CONFIG.thinking,
    outerRadius: 120,    // 円を大きく
    innerRadius: 60,
  },
  speaking: {
    ...DEFAULT_VISUALIZER_CONFIG.speaking,
    faceScale: 180,      // Speaking時の広がりを大きく
  },
  particleSize: 1,       // パーティクルサイズを1/4に
  radiusDispersion: 0.3, // 半径方向の分散（30%）
};

export interface FloatingParticlesProps extends ParticleVisualizerProps {
  /** パーティクル数（デフォルト: 500） */
  particleCount?: number;
  /** パーティクルサイズ（デフォルト: 1） */
  particleSize?: number;
  /** 半径方向の分散量（0-1、デフォルト: 0.3） */
  radiusDispersion?: number;
  /** デバッグモード（FPS表示等） */
  debug?: boolean;
}

export const FloatingParticlesVisualizer: React.FC<FloatingParticlesProps> = ({
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
  particleCount = 500,
  particleSize = 1,
  radiusDispersion = 0.3,
  debug = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // パーティクル数をconfigに反映
  const config: VisualizerConfig = {
    ...FLOATING_PARTICLES_CONFIG,
    ...userConfig,
    listening: {
      ...FLOATING_PARTICLES_CONFIG.listening,
      ...userConfig?.listening,
      particleCount,
    },
  };

  // パーティクルシステムとトランジションマネージャー
  const particleSystemRef = useRef<ParticleSystem | null>(null);
  const transitionManagerRef = useRef<TransitionManager | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());
  const prevStateRef = useRef<VisualizerState>(state);

  // FPS計測用
  const fpsRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(Date.now());

  // audioLevel等の最新値を保持
  const audioLevelRef = useRef<number>(audioLevel);
  audioLevelRef.current = audioLevel;
  const zcrRef = useRef<number>(zcr);
  zcrRef.current = zcr;
  const rmsHighRef = useRef<number>(rmsHigh);
  rmsHighRef.current = rmsHigh;

  // 描画色をrefで管理
  const color = particleColor || config.particleColor;
  const colorRef = useRef<string>(color);
  colorRef.current = color;

  // width/heightをrefで管理
  const widthRef = useRef<number>(width);
  widthRef.current = width;
  const heightRef = useRef<number>(height);
  heightRef.current = height;

  // 初期化
  useEffect(() => {
    const particleSystem = new ParticleSystem(config);
    const transitionManager = new TransitionManager(particleSystem, {
      transition: config.transition,
      particleSize,
      radiusDispersion,
    });

    particleSystemRef.current = particleSystem;
    transitionManagerRef.current = transitionManager;

    // パーティクルを初期化
    particleSystem.initialize(particleCount, width / 2, height / 2);

    // 画面サイズを設定
    transitionManager.setDimensions(width, height);

    // 初期状態を設定
    transitionManager.initialize(state);

    console.log(`[FloatingParticles] Initialized with ${particleCount} particles`);

    // アニメーションループ
    const animate = () => {
      const now = Date.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      // FPS計測
      frameCountRef.current++;
      if (now - lastFpsUpdateRef.current >= 1000) {
        fpsRef.current = frameCountRef.current;
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }

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
  }, [particleCount, particleSize, radiusDispersion]);

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

  // Canvas描画関数
  const draw = useCallback((particles: Particle[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentWidth = widthRef.current;
    const currentHeight = heightRef.current;

    // Retinaディスプレイ対応
    const dpr = window.devicePixelRatio || 1;
    canvas.width = currentWidth * dpr;
    canvas.height = currentHeight * dpr;
    ctx.scale(dpr, dpr);

    // クリア
    ctx.clearRect(0, 0, currentWidth, currentHeight);

    // パーティクル描画
    const currentColor = colorRef.current;

    // バッチ描画で最適化（同じスタイルのパーティクルをまとめて描画）
    ctx.fillStyle = currentColor;

    particles.forEach((p) => {
      ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;

    // デバッグ情報表示
    if (debug) {
      ctx.fillStyle = currentColor;
      ctx.font = '12px monospace';
      ctx.globalAlpha = 0.7;
      ctx.fillText(`FPS: ${fpsRef.current}`, 10, 20);
      ctx.fillText(`Particles: ${particles.length}`, 10, 36);
      ctx.globalAlpha = 1;
    }
  }, [debug]);

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

export default FloatingParticlesVisualizer;
