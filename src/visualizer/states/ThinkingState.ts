/**
 * Thinking State
 *
 * AI思考中の状態
 * 単一円 + 回転 + 脈動
 */

import type {
  StateHandler,
  Particle,
  ThinkingConfig,
  AudioFeatures,
} from '../core/types';
import { DEFAULT_THINKING_CONFIG } from '../core/types';
import { ParticleSystem } from '../core/ParticleSystem';
import type { StateOptions } from './ListeningState';

export class ThinkingState implements StateHandler {
  private config: ThinkingConfig;
  private particleSystem: ParticleSystem;
  private particleSize: number;
  private radiusDispersion: number;
  private centerX: number = 0;
  private centerY: number = 0;

  private dynamicThinkingScale: number = 0;
  private particleOffsets: number[] = [];

  constructor(particleSystem: ParticleSystem, config?: Partial<ThinkingConfig>, options?: StateOptions) {
    this.config = { ...DEFAULT_THINKING_CONFIG, ...config };
    this.particleSystem = particleSystem;
    this.particleSize = options?.particleSize ?? 4;
    this.radiusDispersion = options?.radiusDispersion ?? 0;
  }

  setDimensions(width: number, height: number): void {
    this.centerX = width / 2;
    this.centerY = height / 2;
    this.dynamicThinkingScale = Math.min(width, height) * (1 / 7);
  }

  enter(particles: Particle[], config: ThinkingConfig): void {
    this.config = { ...this.config, ...config };

    // 各パーティクルの半径オフセットを生成（分散用）
    this.particleOffsets = particles.map(() => (Math.random() - 0.5) * 2);

    particles.forEach((p, i) => {
      const pos = this.calculatePosition(i, 0, 1, particles.length, 0);
      p.targetX = pos.x;
      p.targetY = pos.y;
      p.partId = null;
    });
  }

  private calculatePosition(
    index: number,
    time: number,
    breathScale: number = 1,
    totalCount: number,
    dispersionOffset: number = 0
  ): { x: number; y: number } {
    const { rotationSpeed } = this.config;
    const baseRadius = this.dynamicThinkingScale > 0 ? this.dynamicThinkingScale : this.config.outerRadius;

    const angle = (index / totalCount) * Math.PI * 2 + time * rotationSpeed;
    const dispersion = dispersionOffset * baseRadius * this.radiusDispersion;
    const r = baseRadius * breathScale + dispersion;

    return {
      x: this.centerX + r * Math.cos(angle),
      y: this.centerY + r * Math.sin(angle),
    };
  }

  update(
    particles: Particle[],
    _dt: number,
    _audio: AudioFeatures,
    time: number
  ): void {
    const { breathAmount, breathSpeed } = this.config;

    const breathScale = 1 + breathAmount * Math.sin(time * breathSpeed * 0.001);

    const scaledTime = time * 0.001;
    const count = particles.length;

    particles.forEach((p, i) => {
      const offset = this.particleOffsets[i] ?? 0;
      const pos = this.calculatePosition(i, scaledTime, breathScale, count, offset);
      p.x = pos.x;
      p.y = pos.y;

      p.size = this.particleSize;
      p.opacity = 0.5;
    });
  }

  exit(): void {}

  getTargetPositions(): Array<{ x: number; y: number }> {
    const count = this.particleSystem.getCount();
    const baseRadius = this.dynamicThinkingScale > 0 ? this.dynamicThinkingScale : this.config.outerRadius;

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

export const createThinkingState = (
  particleSystem: ParticleSystem,
  config?: Partial<ThinkingConfig>
): ThinkingState => {
  return new ThinkingState(particleSystem, config);
};
