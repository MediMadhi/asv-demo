/**
 * Listening State
 *
 * ユーザー音声入力中の状態
 * 円周上にパーティクルを配置し、ノイズベースで収縮・振動
 */

import type {
  StateHandler,
  Particle,
  ListeningConfig,
  AudioFeatures,
} from '../core/types';
import { DEFAULT_LISTENING_CONFIG } from '../core/types';
import { ParticleSystem } from '../core/ParticleSystem';

export interface StateOptions {
  particleSize?: number;
  radiusDispersion?: number;
}

export class ListeningState implements StateHandler {
  private config: ListeningConfig;
  private particleSystem: ParticleSystem;
  private particleSize: number;
  private radiusDispersion: number;
  private centerX: number = 0;
  private centerY: number = 0;

  private dynamicListeningScale: number = 0;
  private smoothedRms: number = 0;
  private particleOffsets: number[] = [];

  constructor(particleSystem: ParticleSystem, config?: Partial<ListeningConfig>, options?: StateOptions) {
    this.config = { ...DEFAULT_LISTENING_CONFIG, ...config };
    this.particleSystem = particleSystem;
    this.particleSize = options?.particleSize ?? 4;
    this.radiusDispersion = options?.radiusDispersion ?? 0;
  }

  setDimensions(width: number, height: number): void {
    this.centerX = width / 2;
    this.centerY = height / 2;
    this.dynamicListeningScale = Math.min(width, height) * (1 / 4);
  }

  enter(particles: Particle[], config: ListeningConfig): void {
    this.config = { ...this.config, ...config };
    this.smoothedRms = 0;

    const count = particles.length;
    const baseRadius = this.dynamicListeningScale;

    // 各パーティクルの半径オフセットを生成（分散用）
    this.particleOffsets = particles.map(() => (Math.random() - 0.5) * 2);

    particles.forEach((p, i) => {
      const angle = (i / count) * Math.PI * 2;
      p.targetX = this.centerX + Math.cos(angle) * baseRadius;
      p.targetY = this.centerY + Math.sin(angle) * baseRadius;
      p.partId = null;
    });
  }

  update(
    particles: Particle[],
    _dt: number,
    audio: AudioFeatures,
    time: number
  ): void {
    const attackSpeed = 1.0;
    const releaseSpeed = 0.4;
    if (audio.rms > this.smoothedRms) {
      this.smoothedRms += (audio.rms - this.smoothedRms) * attackSpeed;
    } else {
      this.smoothedRms += (audio.rms - this.smoothedRms) * releaseSpeed;
    }

    const zcr = audio.zcr || 0;
    const rmsHigh = audio.rmsHigh || 0;

    const baseRadius = this.dynamicListeningScale > 0 ? this.dynamicListeningScale : 100;

    const sensitivity = 4.0;
    const inwardMovement = baseRadius * 1.5 * this.smoothedRms * sensitivity;
    const currentRadius = Math.max(baseRadius * 0.15, baseRadius - inwardMovement);

    const baseRotationSpeed = -0.0003;
    const rotation = time * baseRotationSpeed;

    const breathFreq = 0.0008;
    const breathAmount = baseRadius * 0.03 * (1 + this.smoothedRms * 3);
    const globalBreath = Math.sin(time * breathFreq) * breathAmount;

    // 分散量の計算（baseRadiusに対する割合）
    const dispersionAmount = baseRadius * this.radiusDispersion;

    // 個別wandering量（分散がある場合のみ適用）
    const wanderAmount = baseRadius * this.radiusDispersion * 0.5;

    particles.forEach((p, i) => {
      const angle = (i / particles.length) * Math.PI * 2 + rotation;

      const baseFreq = 0.004 + zcr * 0.04;
      const freqMultiplier = baseFreq + (i % 7) * 0.0008;
      const phaseOffset = i * 1.2;

      const individualNoiseAmplitude = baseRadius * 0.04 * (this.smoothedRms * 5 + rmsHigh * 6.0);
      const particleNoise = Math.sin(time * freqMultiplier + phaseOffset) * individualNoiseAmplitude;

      // 半径オフセット（分散）を適用
      const offset = this.particleOffsets[i] ?? 0;
      const dispersion = offset * dispersionAmount;

      const r = Math.max(0, currentRadius + globalBreath + particleNoise + dispersion);

      // 基本位置
      let x = this.centerX + Math.cos(angle) * r;
      let y = this.centerY + Math.sin(angle) * r;

      // 個別のwandering（漂い）を追加 - 分散がある場合のみ
      if (this.radiusDispersion > 0) {
        // 各パーティクル固有の周波数とフェーズ
        const wanderFreqX = 0.0006 + (i % 11) * 0.00015;
        const wanderFreqY = 0.0005 + (i % 7) * 0.0002;
        const wanderPhaseX = i * 1.7;
        const wanderPhaseY = i * 0.8;

        // X/Y方向に独立した漂い
        const wanderX = Math.sin(time * wanderFreqX + wanderPhaseX) * wanderAmount;
        const wanderY = Math.cos(time * wanderFreqY + wanderPhaseY) * wanderAmount;

        x += wanderX;
        y += wanderY;
      }

      p.x = x;
      p.y = y;

      p.size = this.particleSize;
      p.opacity = 0.5;
    });
  }

  exit(): void {
    this.smoothedRms = 0;
  }

  getTargetPositions(): Array<{ x: number; y: number }> {
    const count = this.particleSystem.getCount();
    const baseRadius = this.dynamicListeningScale > 0 ? this.dynamicListeningScale : 100;

    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return {
        x: this.centerX + baseRadius * Math.cos(angle),
        y: this.centerY + baseRadius * Math.sin(angle),
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
}

export const createListeningState = (
  particleSystem: ParticleSystem,
  config?: Partial<ListeningConfig>
): ListeningState => {
  return new ListeningState(particleSystem, config);
};
