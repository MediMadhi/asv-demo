/**
 * Easing Functions
 *
 * 状態遷移アニメーション用のイージング関数
 */

import type { EasingFunction } from './types';

// ===== 基本イージング =====

export const linear: EasingFunction = (t) => t;

export const easeInQuad: EasingFunction = (t) => t * t;

export const easeOutQuad: EasingFunction = (t) => t * (2 - t);

export const easeInOutQuad: EasingFunction = (t) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

// ===== 三次関数 =====

export const easeInCubic: EasingFunction = (t) => t * t * t;

export const easeOutCubic: EasingFunction = (t) => {
  const t1 = t - 1;
  return t1 * t1 * t1 + 1;
};

export const easeInOutCubic: EasingFunction = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ===== バック（オーバーシュート） =====

const BACK_OVERSHOOT = 1.70158;

export const easeInBack: EasingFunction = (t) => {
  const c = BACK_OVERSHOOT + 1;
  return c * t * t * t - BACK_OVERSHOOT * t * t;
};

export const easeOutBack: EasingFunction = (t) => {
  const c = BACK_OVERSHOOT + 1;
  const t1 = t - 1;
  return 1 + c * t1 * t1 * t1 + BACK_OVERSHOOT * t1 * t1;
};

export const easeInOutBack: EasingFunction = (t) => {
  const c = BACK_OVERSHOOT * 1.525;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
};

// ===== エラスティック（弾性） =====

export const easeOutElastic: EasingFunction = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const c = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
};

export const easeInElastic: EasingFunction = (t) => {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const c = (2 * Math.PI) / 3;
  return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c);
};

// ===== バウンス =====

export const easeOutBounce: EasingFunction = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;

  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    const t1 = t - 1.5 / d1;
    return n1 * t1 * t1 + 0.75;
  } else if (t < 2.5 / d1) {
    const t1 = t - 2.25 / d1;
    return n1 * t1 * t1 + 0.9375;
  } else {
    const t1 = t - 2.625 / d1;
    return n1 * t1 * t1 + 0.984375;
  }
};

// ===== ユーティリティ =====

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const remap = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number => {
  const t = (value - inMin) / (inMax - inMin);
  return lerp(outMin, outMax, clamp(t, 0, 1));
};

// ===== 状態遷移用のイージングマップ =====

export const TRANSITION_EASINGS = {
  listeningToThinking: easeInOutCubic,
  thinkingToSpeaking: easeInOutCubic,
  speakingToListening: easeInOutCubic,
  listeningToMuted: easeInOutCubic,
  thinkingToMuted: easeInOutCubic,
  speakingToMuted: easeInOutCubic,
  mutedToListening: easeInOutCubic,
  mutedToThinking: easeInOutCubic,
  mutedToSpeaking: easeInOutCubic,
} as const;

export const getTransitionEasing = (
  from: string,
  to: string
): EasingFunction => {
  const key = `${from}To${to.charAt(0).toUpperCase() + to.slice(1)}` as keyof typeof TRANSITION_EASINGS;
  return TRANSITION_EASINGS[key] || easeOutCubic;
};
