/**
 * Idle State
 *
 * AI待機状態（マイクON・ユーザー発話待ち）。
 * listening（ユーザー発話中＝RMSで収縮・振動）とは明確に区別し、
 * 音声には反応せず、ゆっくり左回転する幅狭めのリングで散らばりを表現する。
 * （orqest の floating idle モーションに準拠）
 */

import type {
  StateHandler,
  Particle,
  IdleConfig,
  AudioFeatures,
} from '../core/types';
import { DEFAULT_IDLE_CONFIG } from '../core/types';
import { ParticleSystem } from '../core/ParticleSystem';
import type { StateOptions } from './ListeningState';

export class IdleState implements StateHandler {
  private config: IdleConfig;
  private particleSystem: ParticleSystem;
  private particleSize: number;
  private radiusDispersion: number;
  private centerX: number = 0;
  private centerY: number = 0;

  private dynamicBaseRadius: number = 0;
  private particleOffsets: number[] = [];

  constructor(particleSystem: ParticleSystem, config?: Partial<IdleConfig>, options?: StateOptions) {
    this.config = { ...DEFAULT_IDLE_CONFIG, ...config };
    this.particleSystem = particleSystem;
    this.particleSize = options?.particleSize ?? 4;
    this.radiusDispersion = options?.radiusDispersion ?? 0;
  }

  setDimensions(width: number, height: number): void {
    this.centerX = width / 2;
    this.centerY = height / 2;
    // listening と同じ基準半径（min(w,h)/4）。muted より大きい待機リング。
    this.dynamicBaseRadius = Math.min(width, height) * (1 / 4);
  }

  enter(particles: Particle[], config: IdleConfig): void {
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
    const baseRadius = this.dynamicBaseRadius > 0 ? this.dynamicBaseRadius : this.config.baseRadius;

    // 静かにゆっくり呼吸（振幅は控えめ）
    const currentRadius = baseRadius * (1 + Math.sin(time * 0.0006) * 0.03);

    // ゆっくり左回り
    const rotation = time * -0.0003;

    // 半径分散（muted より狭い＝幅狭めのリング）。radiusDispersion が有効な場合のみ。
    const dispersionAmount = baseRadius * (this.radiusDispersion > 0 ? this.radiusDispersion * 0.5 : 0);

    particles.forEach((p, i) => {
      const baseAngle = (i / particles.length) * Math.PI * 2 + rotation;

      // 個別ワンダー（muted の 0.15 より狭い 0.08）。音声には反応しない。
      const individualFreqX = 0.0008 + (i % 7) * 0.0002;
      const individualFreqY = 0.0007 + (i % 5) * 0.00025;
      const wanderAmount = baseRadius * 0.08;
      const offX = Math.sin(time * individualFreqX + i * 1.3) * wanderAmount;
      const offY = Math.cos(time * individualFreqY + i * 0.9) * wanderAmount;

      const offset = this.particleOffsets[i] ?? 0;
      const dispersion = offset * dispersionAmount;

      p.x = this.centerX + Math.cos(baseAngle) * (currentRadius + dispersion) + offX;
      p.y = this.centerY + Math.sin(baseAngle) * (currentRadius + dispersion) + offY;

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

export const createIdleState = (
  particleSystem: ParticleSystem,
  config?: Partial<IdleConfig>
): IdleState => {
  return new IdleState(particleSystem, config);
};
