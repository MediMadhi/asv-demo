/**
 * Particle System
 *
 * パーティクルの生成、更新、管理を行う基盤クラス
 */

import type {
  Particle,
  FacePartId,
  VisualizerConfig,
} from './types';
import { DEFAULT_VISUALIZER_CONFIG } from './types';
import { lerp, clamp } from './easing';

// ===== Perlin Noise 実装（簡易版） =====

class PerlinNoise {
  private permutation: number[];

  constructor(seed: number = 0) {
    this.permutation = this.generatePermutation(seed);
  }

  private generatePermutation(seed: number): number[] {
    const p = Array.from({ length: 256 }, (_, i) => i);
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    return [...p, ...p];
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private grad(hash: number, x: number): number {
    return (hash & 1) === 0 ? x : -x;
  }

  noise1D(x: number): number {
    const X = Math.floor(x) & 255;
    x -= Math.floor(x);
    const u = this.fade(x);
    const a = this.permutation[X];
    const b = this.permutation[X + 1];
    return lerp(this.grad(a, x), this.grad(b, x - 1), u);
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);

    const aa = this.permutation[this.permutation[X] + Y];
    const ab = this.permutation[this.permutation[X] + Y + 1];
    const ba = this.permutation[this.permutation[X + 1] + Y];
    const bb = this.permutation[this.permutation[X + 1] + Y + 1];

    const gradAA = ((aa & 1) === 0 ? x : -x) + ((aa & 2) === 0 ? y : -y);
    const gradBA = ((ba & 1) === 0 ? x - 1 : -(x - 1)) + ((ba & 2) === 0 ? y : -y);
    const gradAB = ((ab & 1) === 0 ? x : -x) + ((ab & 2) === 0 ? y - 1 : -(y - 1));
    const gradBB = ((bb & 1) === 0 ? x - 1 : -(x - 1)) + ((bb & 2) === 0 ? y - 1 : -(y - 1));

    return lerp(
      lerp(gradAA, gradBA, u),
      lerp(gradAB, gradBB, u),
      v
    );
  }
}

// ===== パーティクルシステム =====

export class ParticleSystem {
  private particles: Particle[] = [];
  private noise: PerlinNoise;
  private config: VisualizerConfig;

  constructor(config?: Partial<VisualizerConfig>) {
    this.config = { ...DEFAULT_VISUALIZER_CONFIG, ...config };
    this.noise = new PerlinNoise(Date.now());
  }

  getParticles(): Particle[] {
    return this.particles;
  }

  getCount(): number {
    return this.particles.length;
  }

  updateConfig(config: Partial<VisualizerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  initialize(count: number, centerX: number, centerY: number): void {
    this.particles = Array.from({ length: count }, (_, i) =>
      this.createParticle(i, centerX, centerY)
    );
  }

  private createParticle(id: number, x: number, y: number): Particle {
    return {
      id,
      x,
      y,
      x3d: 0,
      y3d: 0,
      z3d: 0,
      startX: x,
      startY: y,
      targetX: x,
      targetY: y,
      progress: 1,
      delay: 0,
      size: 4,
      opacity: 1,
      color: this.config.particleColor,
      partId: null,
    };
  }

  resize(newCount: number, centerX: number, centerY: number): void {
    const currentCount = this.particles.length;

    if (newCount > currentCount) {
      for (let i = currentCount; i < newCount; i++) {
        this.particles.push(this.createParticle(i, centerX, centerY));
      }
    } else if (newCount < currentCount) {
      this.particles.length = newCount;
    }

    this.particles.forEach((p, i) => {
      p.id = i;
    });
  }

  getNoise(index: number, time: number, scale: number = 1): number {
    return this.noise.noise2D(index * scale, time);
  }

  getNoise2D(x: number, y: number): number {
    return this.noise.noise2D(x, y);
  }

  startTransition(
    getTarget: (particle: Particle, index: number) => { x: number; y: number },
    getDelay?: (particle: Particle, index: number, centerX: number, centerY: number) => number,
    centerX: number = 0,
    centerY: number = 0
  ): void {
    this.particles.forEach((p, i) => {
      p.startX = p.x;
      p.startY = p.y;
      const target = getTarget(p, i);
      p.targetX = target.x;
      p.targetY = target.y;
      p.progress = 0;
      p.delay = getDelay ? getDelay(p, i, centerX, centerY) : 0;
    });
  }

  updateTransition(
    _dt: number,
    duration: number,
    easing: (t: number) => number,
    elapsed: number
  ): boolean {
    let allComplete = true;

    this.particles.forEach((p) => {
      if (p.progress >= 1) return;

      if (elapsed < p.delay) {
        allComplete = false;
        return;
      }

      const adjustedElapsed = elapsed - p.delay;
      p.progress = clamp(adjustedElapsed / duration, 0, 1);

      const t = easing(p.progress);
      p.x = lerp(p.startX, p.targetX, t);
      p.y = lerp(p.startY, p.targetY, t);

      if (p.progress < 1) {
        allComplete = false;
      }
    });

    return allComplete;
  }

  assignToFaceParts(
    targets: Array<{ x: number; y: number; partId: FacePartId }>,
    centerX: number,
    centerY: number,
    scale: number
  ): void {
    if (targets.length < this.particles.length) {
      console.warn(
        `[ParticleSystem] Not enough targets: ${targets.length} targets for ${this.particles.length} particles`
      );
    }

    const usedTargets = new Set<number>();

    this.particles.forEach((p) => {
      let bestIdx = 0;
      let bestDist = Infinity;

      targets.forEach((t, i) => {
        if (usedTargets.has(i)) return;

        const screenX = centerX + t.x * scale;
        const screenY = centerY + t.y * scale;
        const dist = Math.hypot(p.x - screenX, p.y - screenY);

        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      });

      usedTargets.add(bestIdx);

      const target = targets[bestIdx];
      if (target) {
        p.targetX = centerX + target.x * scale;
        p.targetY = centerY + target.y * scale;
        p.x3d = target.x;
        p.y3d = target.y;
        p.z3d = 0;
        p.partId = target.partId;
      }
    });
  }

  forEach(fn: (particle: Particle, index: number) => void): void {
    this.particles.forEach(fn);
  }

  forEachInPart(partId: FacePartId, fn: (particle: Particle) => void): void {
    this.particles
      .filter((p) => p.partId === partId)
      .forEach(fn);
  }

  setPosition(index: number, x: number, y: number): void {
    const p = this.particles[index];
    if (p) {
      p.x = x;
      p.y = y;
    }
  }

  setProperties(
    index: number,
    props: Partial<Pick<Particle, 'x' | 'y' | 'size' | 'opacity' | 'color'>>
  ): void {
    const p = this.particles[index];
    if (p) {
      Object.assign(p, props);
    }
  }

  setVisualProperties(size: number, opacity: number): void {
    this.particles.forEach((p) => {
      p.size = size;
      p.opacity = opacity;
    });
  }

  reset(centerX: number, centerY: number): void {
    this.particles.forEach((p) => {
      p.x = centerX;
      p.y = centerY;
      p.targetX = centerX;
      p.targetY = centerY;
      p.progress = 1;
      p.delay = 0;
      p.partId = null;
    });
  }

  dispose(): void {
    this.particles = [];
  }
}

// ===== シングルトンインスタンス =====

let sharedInstance: ParticleSystem | null = null;

export const getSharedParticleSystem = (
  config?: Partial<VisualizerConfig>
): ParticleSystem => {
  if (!sharedInstance) {
    sharedInstance = new ParticleSystem(config);
  }
  return sharedInstance;
};

export const disposeSharedParticleSystem = (): void => {
  if (sharedInstance) {
    sharedInstance.dispose();
    sharedInstance = null;
  }
};
