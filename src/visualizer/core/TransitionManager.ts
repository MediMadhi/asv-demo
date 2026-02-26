/**
 * Transition Manager
 *
 * 状態間の遷移アニメーションを管理
 */

import type {
  VisualizerState,
  StateMachineContext,
  TransitionConfig,
  AudioFeatures,
} from './types';
import { DEFAULT_TRANSITION_CONFIG, DEFAULT_LISTENING_CONFIG, DEFAULT_THINKING_CONFIG, DEFAULT_SPEAKING_CONFIG, DEFAULT_MUTED_CONFIG } from './types';
import { ParticleSystem } from './ParticleSystem';
import { TRANSITION_EASINGS, lerp } from './easing';
import { ListeningState } from '../states/ListeningState';
import { ThinkingState } from '../states/ThinkingState';
import { SpeakingState } from '../states/SpeakingState';
import { MutedState } from '../states/MutedState';

export interface TransitionManagerOptions {
  transition?: Partial<TransitionConfig>;
  particleSize?: number;
  radiusDispersion?: number;
}

export class TransitionManager {
  private particleSystem: ParticleSystem;
  private config: TransitionConfig;
  private particleSize: number;
  private radiusDispersion: number;

  private listeningState: ListeningState;
  private thinkingState: ThinkingState;
  private speakingState: SpeakingState;
  private mutedState: MutedState;

  private context: StateMachineContext = {
    currentState: 'listening',
    previousState: null,
    transitionProgress: 1,
    stateStartTime: 0,
    isTransitioning: false,
  };

  private transitionStartTime: number = 0;
  private transitionDuration: number = 0;
  private transitionEasing: (t: number) => number = (t) => t;

  private centerX: number = 0;
  private centerY: number = 0;

  constructor(
    particleSystem: ParticleSystem,
    options?: TransitionManagerOptions
  ) {
    this.particleSystem = particleSystem;
    this.config = { ...DEFAULT_TRANSITION_CONFIG, ...options?.transition };
    this.particleSize = options?.particleSize ?? 4;
    this.radiusDispersion = options?.radiusDispersion ?? 0;

    const stateOptions = {
      particleSize: this.particleSize,
      radiusDispersion: this.radiusDispersion,
    };

    this.listeningState = new ListeningState(particleSystem, undefined, stateOptions);
    this.thinkingState = new ThinkingState(particleSystem, undefined, stateOptions);
    this.speakingState = new SpeakingState(particleSystem, undefined, stateOptions);
    this.mutedState = new MutedState(particleSystem, undefined, stateOptions);
  }

  setDimensions(width: number, height: number): void {
    this.centerX = width / 2;
    this.centerY = height / 2;

    this.listeningState.setDimensions(width, height);
    this.thinkingState.setDimensions(width, height);
    this.speakingState.setDimensions(width, height);
    this.mutedState.setDimensions(width, height);
  }

  initialize(initialState: VisualizerState = 'listening'): void {
    const particles = this.particleSystem.getParticles();

    this.context = {
      currentState: initialState,
      previousState: null,
      transitionProgress: 1,
      stateStartTime: Date.now(),
      isTransitioning: false,
    };

    const handler = this.getStateHandler(initialState);
    const config = this.getStateConfig(initialState);
    handler.enter(particles, config as any);
  }

  private getStateHandler(state: VisualizerState) {
    switch (state) {
      case 'listening':
        return this.listeningState;
      case 'thinking':
        return this.thinkingState;
      case 'speaking':
        return this.speakingState;
      case 'muted':
        return this.mutedState;
    }
  }

  private getStateConfig(state: VisualizerState) {
    switch (state) {
      case 'listening':
        return DEFAULT_LISTENING_CONFIG;
      case 'thinking':
        return DEFAULT_THINKING_CONFIG;
      case 'speaking':
        return DEFAULT_SPEAKING_CONFIG;
      case 'muted':
        return DEFAULT_MUTED_CONFIG;
    }
  }

  private getTransitionDuration(from: VisualizerState, to: VisualizerState): number {
    if (to === 'muted') {
      return this.config.toMuted;
    }
    if (from === 'muted') {
      return this.config.fromMuted;
    }
    if (from === 'listening' && to === 'thinking') {
      return this.config.listeningToThinking;
    } else if (from === 'thinking' && to === 'speaking') {
      return this.config.thinkingToSpeaking;
    } else if (from === 'speaking' && to === 'listening') {
      return this.config.speakingToListening;
    }
    return 400;
  }

  transitionTo(newState: VisualizerState, time: number): void {
    if (this.context.currentState === newState) return;
    if (this.context.isTransitioning) {
      this.completeTransition();
    }

    const particles = this.particleSystem.getParticles();
    const fromState = this.context.currentState;
    const toHandler = this.getStateHandler(newState);

    const fromHandler = this.getStateHandler(fromState);
    fromHandler.exit();

    this.context.previousState = fromState;
    this.context.currentState = newState;
    this.context.isTransitioning = true;
    this.context.transitionProgress = 0;
    this.transitionStartTime = time;
    this.transitionDuration = this.getTransitionDuration(fromState, newState);

    const easingKey = `${fromState}To${newState.charAt(0).toUpperCase() + newState.slice(1)}` as keyof typeof TRANSITION_EASINGS;
    this.transitionEasing = TRANSITION_EASINGS[easingKey] || ((t: number) => t);

    if (newState === 'speaking') {
      const requiredCount = this.speakingState.getRequiredParticleCount();
      if (particles.length < requiredCount) {
        this.particleSystem.resize(requiredCount, this.centerX, this.centerY);
      }
    }

    this.setupTransitionTargets(newState);

    const config = this.getStateConfig(newState);
    toHandler.enter(this.particleSystem.getParticles(), config as any);

    this.context.stateStartTime = time;
  }

  private setupTransitionTargets(toState: VisualizerState): void {
    const particles = this.particleSystem.getParticles();

    switch (toState) {
      case 'listening': {
        const targets = this.listeningState.getTargetPositions();
        particles.forEach((p, i) => {
          p.startX = p.x;
          p.startY = p.y;
          const target = targets[i % targets.length];
          p.targetX = target.x;
          p.targetY = target.y;
          p.progress = 0;
          p.delay = this.listeningState.getStaggerDelay(p, i, this.centerX, this.centerY);
        });
        break;
      }
      case 'thinking': {
        const targets = this.thinkingState.getTargetPositions();
        particles.forEach((p, i) => {
          p.startX = p.x;
          p.startY = p.y;
          const target = targets[i % targets.length];
          p.targetX = target.x;
          p.targetY = target.y;
          p.progress = 0;
          p.delay = this.thinkingState.getStaggerDelay(p, i, this.centerX, this.centerY);
        });
        break;
      }
      case 'speaking': {
        const targets = this.speakingState.getTargetPositions();
        particles.forEach((p, i) => {
          p.startX = p.x;
          p.startY = p.y;
          if (i < targets.length) {
            p.targetX = targets[i].x;
            p.targetY = targets[i].y;
            p.partId = targets[i].partId;
          }
          p.progress = 0;
          p.delay = this.speakingState.getStaggerDelay(p, i, this.centerX, this.centerY);
        });
        break;
      }
      case 'muted': {
        const targets = this.mutedState.getTargetPositions();
        particles.forEach((p, i) => {
          p.startX = p.x;
          p.startY = p.y;
          const target = targets[i % targets.length];
          p.targetX = target.x;
          p.targetY = target.y;
          p.progress = 0;
          p.delay = this.mutedState.getStaggerDelay(p, i, this.centerX, this.centerY);
        });
        break;
      }
    }
  }

  private completeTransition(): void {
    const particles = this.particleSystem.getParticles();

    particles.forEach((p) => {
      p.x = p.targetX;
      p.y = p.targetY;
      p.progress = 1;
    });

    this.context.isTransitioning = false;
    this.context.transitionProgress = 1;
  }

  update(dt: number, audio: AudioFeatures, time: number): void {
    const particles = this.particleSystem.getParticles();

    if (this.context.isTransitioning) {
      const elapsed = time - this.transitionStartTime;
      this.context.transitionProgress = Math.min(1, elapsed / this.transitionDuration);

      particles.forEach((p) => {
        if (elapsed < p.delay) return;

        const adjustedElapsed = elapsed - p.delay;
        const progress = Math.min(1, adjustedElapsed / this.transitionDuration);
        const t = this.transitionEasing(progress);

        p.x = lerp(p.startX, p.targetX, t);
        p.y = lerp(p.startY, p.targetY, t);
        p.progress = progress;
      });

      if (this.context.transitionProgress >= 1) {
        this.completeTransition();
      }
    } else {
      const handler = this.getStateHandler(this.context.currentState);
      handler.update(particles, dt, audio, time);
    }
  }

  getCurrentState(): VisualizerState {
    return this.context.currentState;
  }

  isTransitioning(): boolean {
    return this.context.isTransitioning;
  }

  getTransitionProgress(): number {
    return this.context.transitionProgress;
  }

  getContext(): StateMachineContext {
    return { ...this.context };
  }

  getListeningState(): ListeningState {
    return this.listeningState;
  }

  getThinkingState(): ThinkingState {
    return this.thinkingState;
  }

  getSpeakingState(): SpeakingState {
    return this.speakingState;
  }

  getMutedState(): MutedState {
    return this.mutedState;
  }

  dispose(): void {
    this.listeningState.exit();
    this.thinkingState.exit();
    this.speakingState.exit();
    this.mutedState.exit();
  }
}
