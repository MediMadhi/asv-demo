/**
 * Muted State
 *
 * マイクミュート状態
 * 小さな円周上にパーティクルを配置し、緩やかな脈動のみで静止感を表現
 */

import type {
  StateHandler,
  Particle,
  MutedConfig,
  AudioFeatures,
} from '../core/types';
import { DEFAULT_MUTED_CONFIG } from '../core/types';
import { ParticleSystem } from '../core/ParticleSystem';
import type { StateOptions } from './ListeningState';

export class MutedState implements StateHandler {
  private config: MutedConfig;
  private particleSystem: ParticleSystem;
  private particleSize: number;
  private radiusDispersion: number;
  private centerX: number = 0;
  private centerY: number = 0;

  private dynamicBaseRadius: number = 0;
  private particleOffsets: number[] = [];

  constructor(particleSystem: ParticleSystem, config?: Partial<MutedConfig>, options?: StateOptions) {
    this.config = { ...DEFAULT_MUTED_CONFIG, ...config };
    this.particleSystem = particleSystem;
    this.particleSize = options?.particleSize ?? 4;
    this.radiusDispersion = options?.radiusDispersion ?? 0;
  }

  setDimensions(width: number, height: number): void {
    this.centerX = width / 2;
    this.centerY = height / 2;
    this.dynamicBaseRadius = Math.min(width, height) * (1 / 6);
  }

  enter(particles: Particle[], config: MutedConfig): void {
    this.config = { ...this.config, ...config };

    const count = particles.length;
    const baseRadius = this.dynamicBaseRadius > 0 ? this.dynamicBaseRadius : this.config.baseRadius;

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
    _audio: AudioFeatures,
    time: number
  ): void {
    const { pulseSpeed } = this.config;
    const baseRadius = this.dynamicBaseRadius > 0 ? this.dynamicBaseRadius : this.config.baseRadius;

    const pulseAmount = 0.15;
    const pulse = Math.sin(time * 0.001 * pulseSpeed) * pulseAmount;
    const currentRadius = baseRadius * (1 + pulse);

    const rotationSpeed = 0.0002;
    const rotation = time * rotationSpeed;

    // 分散量の計算（baseRadiusに対する割合）
    const dispersionAmount = baseRadius * this.radiusDispersion;

    particles.forEach((p, i) => {
      const baseAngle = (i / particles.length) * Math.PI * 2 + rotation;

      const individualFreqX = 0.0008 + (i % 7) * 0.0002;
      const individualFreqY = 0.0007 + (i % 5) * 0.00025;
      const phaseX = i * 1.3;
      const phaseY = i * 0.9;

      const wanderAmount = baseRadius * 0.15;
      const individualOffsetX = Math.sin(time * individualFreqX + phaseX) * wanderAmount;
      const individualOffsetY = Math.cos(time * individualFreqY + phaseY) * wanderAmount;

      // 半径オフセット（分散）を適用
      const offset = this.particleOffsets[i] ?? 0;
      const dispersion = offset * dispersionAmount;

      p.x = this.centerX + Math.cos(baseAngle) * (currentRadius + dispersion) + individualOffsetX;
      p.y = this.centerY + Math.sin(baseAngle) * (currentRadius + dispersion) + individualOffsetY;

      p.size = this.particleSize;
      p.opacity = 0.5;
    });
  }

  exit(): void {}

  getTargetPositions(): Array<{ x: number; y: number }> {
    const count = this.particleSystem.getCount();
    const baseRadius = this.dynamicBaseRadius > 0 ? this.dynamicBaseRadius : this.config.baseRadius;

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

export const createMutedState = (
  particleSystem: ParticleSystem,
  config?: Partial<MutedConfig>
): MutedState => {
  return new MutedState(particleSystem, config);
};
