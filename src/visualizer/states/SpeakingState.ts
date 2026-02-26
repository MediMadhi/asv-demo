/**
 * Speaking State
 *
 * AI応答中の状態
 * シンプルな円形が音声RMSに合わせてパルス振動する
 */

import type {
  StateHandler,
  Particle,
  SpeakingConfig,
  AudioFeatures,
  FacePartId,
} from '../core/types';
import { DEFAULT_SPEAKING_CONFIG } from '../core/types';
import { ParticleSystem } from '../core/ParticleSystem';
import type { StateOptions } from './ListeningState';

export class SpeakingState implements StateHandler {
  private config: SpeakingConfig;
  private particleSystem: ParticleSystem;
  private particleSize: number;
  private radiusDispersion: number;

  private centerX: number = 0;
  private centerY: number = 0;

  private dynamicFaceScale: number = 0;
  private smoothedRms: number = 0;
  private particleOffsets: number[] = [];

  constructor(
    particleSystem: ParticleSystem,
    config?: Partial<SpeakingConfig>,
    options?: StateOptions
  ) {
    this.config = { ...DEFAULT_SPEAKING_CONFIG, ...config };
    this.particleSystem = particleSystem;
    this.particleSize = options?.particleSize ?? 4;
    this.radiusDispersion = options?.radiusDispersion ?? 0;
  }

  setDimensions(width: number, height: number): void {
    this.centerX = width / 2;
    this.centerY = height / 2;
    this.dynamicFaceScale = Math.min(width, height) * (1 / 5.5);
  }

  enter(particles: Particle[], config: SpeakingConfig): void {
    this.config = { ...this.config, ...config };
    this.smoothedRms = 0;

    const count = particles.length;
    const baseRadius = this.dynamicFaceScale > 0 ? this.dynamicFaceScale : this.config.faceScale;

    // 各パーティクルの半径オフセットを生成（分散用）
    this.particleOffsets = particles.map(() => (Math.random() - 0.5) * 2);

    particles.forEach((p, i) => {
      const angle = (i / count) * Math.PI * 2;

      p.targetX = this.centerX + Math.cos(angle) * baseRadius;
      p.targetY = this.centerY + Math.sin(angle) * baseRadius;

      p.x3d = 0;
      p.y3d = 0;
      p.z3d = 0;
      p.partId = null;
    });
  }

  update(
    particles: Particle[],
    _dt: number,
    audio: AudioFeatures,
    time: number
  ): void {
    const { mouthSensitivity } = this.config;
    const baseRadius = this.dynamicFaceScale > 0 ? this.dynamicFaceScale : this.config.faceScale;

    this.smoothedRms += (audio.rms - this.smoothedRms) * 0.6;

    const zcr = audio.zcr || 0;
    const rmsHigh = audio.rmsHigh || 0;

    const pulseAmount = this.smoothedRms * mouthSensitivity * 0.15;

    const jitterAmount = 0.03 * (this.smoothedRms * 0.6 + rmsHigh * 0.4);
    const jitter = Math.sin(time * 0.05) * Math.cos(time * 0.037) * (baseRadius * jitterAmount);

    const currentRadius = baseRadius * (1 + pulseAmount) + jitter;

    const rotation = time * 0.0005;

    const count = particles.length;

    // 分散量の計算（baseRadiusに対する割合）
    const dispersionAmount = baseRadius * this.radiusDispersion;

    particles.forEach((p, i) => {
      const angle = (i / count) * Math.PI * 2 + rotation;

      const baseFreq = 0.003 + zcr * 0.03;
      const freqMultiplier = baseFreq + (i % 5) * 0.0005;
      const phaseOffset = i * 0.7;

      const individualNoiseAmplitude = baseRadius * 0.01 * (1 + this.smoothedRms + rmsHigh * 5.0);

      const particleNoise = Math.sin(time * freqMultiplier + phaseOffset) * individualNoiseAmplitude;

      // 半径オフセット（分散）を適用
      const offset = this.particleOffsets[i] ?? 0;
      const dispersion = offset * dispersionAmount;

      const r = currentRadius + particleNoise + dispersion;

      p.x = this.centerX + Math.cos(angle) * r;
      p.y = this.centerY + Math.sin(angle) * r;

      p.size = this.particleSize;
      p.opacity = 0.5;
    });
  }

  exit(): void {
    this.smoothedRms = 0;
  }

  getTargetPositions(): Array<{ x: number; y: number; partId: FacePartId }> {
    const count = this.particleSystem.getCount();
    const { faceScale } = this.config;

    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return {
        x: this.centerX + Math.cos(angle) * faceScale,
        y: this.centerY + Math.sin(angle) * faceScale,
        partId: null as unknown as FacePartId,
      };
    });
  }

  getStaggerDelay(
    _particle: Particle,
    _index: number,
    _centerX: number,
    _centerY: number
  ): number {
    return 0;
  }

  getRequiredParticleCount(): number {
    return 0;
  }

  getFacePointCloud(): any { return null; }
  getFaceAnimator(): any { return null; }
}

export const createSpeakingState = (
  particleSystem: ParticleSystem,
  config?: Partial<SpeakingConfig>,
  options?: StateOptions
): SpeakingState => {
  return new SpeakingState(particleSystem, config, options);
};
