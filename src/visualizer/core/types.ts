/**
 * Particle Visualizer - Core Type Definitions (Web Version)
 *
 * 3状態モデル（Listening/Thinking/Speaking）のパーティクルビジュアライザー
 * Web版ではSharedValue依存を除去
 */

// ===== 状態定義 =====

export type VisualizerState = 'listening' | 'thinking' | 'speaking' | 'muted';

export interface StateMachineContext {
  currentState: VisualizerState;
  previousState: VisualizerState | null;
  transitionProgress: number;
  stateStartTime: number;
  isTransitioning: boolean;
}

// ===== 音声特徴量 =====

export interface AudioFeatures {
  rms: number;
  peak: number;
  timestamp: number;
  zcr?: number;
  rmsHigh?: number;
}

// ===== パーティクル =====

export interface Particle {
  id: number;
  x: number;
  y: number;
  x3d: number;
  y3d: number;
  z3d: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  delay: number;
  size: number;
  opacity: number;
  color: string;
  partId: FacePartId | null;
}

// ===== 顔パーツ =====

export type FacePartId =
  | 'outline'
  | 'leftEyebrow'
  | 'rightEyebrow'
  | 'leftEye'
  | 'rightEye'
  | 'nose'
  | 'upperLip'
  | 'lowerLip';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface FacePointCloudSchema {
  meta: {
    name: string;
    version: string;
    description?: string;
    totalPoints: number;
  };
  bounds: {
    width: number;
    height: number;
    depth: number;
  };
  parts: Record<FacePartId, Point3D[]>;
  animation: {
    blink: {
      affectedParts: FacePartId[];
      scaleRange: [number, number];
      durationMs: number;
    };
    mouthOpen: {
      affectedParts: FacePartId[];
      axis: Point3D;
      maxDisplacement: number;
    };
    headSway: {
      rotationRange: { x: number; y: number };
      speed: number;
    };
  };
}

// ===== 状態ハンドラー =====

export interface StateHandler {
  enter(particles: Particle[], config: StateConfig): void;
  update(particles: Particle[], dt: number, audio: AudioFeatures, time: number): void;
  exit(): void;
}

// ===== 設定 =====

export interface ListeningConfig {
  particleCount: number;
  lineWidthRatio: number;
  centerYRatio: number;
  maxAmplitude: number;
  noiseScale: number;
  smoothing: number;
}

export interface ThinkingConfig {
  outerRadius: number;
  innerRadius: number;
  outerCountRatio: number;
  rotationSpeed: number;
  breathAmount: number;
  breathSpeed: number;
}

export interface SpeakingConfig {
  faceScale: number;
  mouthSensitivity: number;
  blinkIntervalMin: number;
  blinkIntervalMax: number;
  headSwayAmount: number;
}

export interface MutedConfig {
  baseRadius: number;
  pulseSpeed: number;
  pulseAmount: number;
  baseOpacity: number;
}

export type StateConfig = ListeningConfig | ThinkingConfig | SpeakingConfig | MutedConfig;

export interface TransitionConfig {
  listeningToThinking: number;
  thinkingToSpeaking: number;
  speakingToListening: number;
  toMuted: number;
  fromMuted: number;
}

export interface VisualizerConfig {
  listening: ListeningConfig;
  thinking: ThinkingConfig;
  speaking: SpeakingConfig;
  muted: MutedConfig;
  transition: TransitionConfig;
  particleColor: string;
  backgroundColor: string;
  /** パーティクルのサイズ（デフォルト: 4） */
  particleSize: number;
  /** 半径方向の分散量（0-1、デフォルト: 0 = 分散なし） */
  radiusDispersion: number;
}

// ===== デフォルト設定 =====

export const DEFAULT_LISTENING_CONFIG: ListeningConfig = {
  particleCount: 40,
  lineWidthRatio: 0.8,
  centerYRatio: 0.5,
  maxAmplitude: 500,
  noiseScale: 0.3,
  smoothing: 0.2,
};

export const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  outerRadius: 80,
  innerRadius: 40,
  outerCountRatio: 0.6,
  rotationSpeed: 0.5,
  breathAmount: 0.15,
  breathSpeed: 2.0,
};

export const DEFAULT_SPEAKING_CONFIG: SpeakingConfig = {
  faceScale: 150,
  mouthSensitivity: 4.0,
  blinkIntervalMin: 2000,
  blinkIntervalMax: 5000,
  headSwayAmount: 5,
};

export const DEFAULT_MUTED_CONFIG: MutedConfig = {
  baseRadius: 40,
  pulseSpeed: 1.5,
  pulseAmount: 0.05,
  baseOpacity: 0.4,
};

export const DEFAULT_TRANSITION_CONFIG: TransitionConfig = {
  listeningToThinking: 500,
  thinkingToSpeaking: 600,
  speakingToListening: 700,
  toMuted: 400,
  fromMuted: 400,
};

export const DEFAULT_VISUALIZER_CONFIG: VisualizerConfig = {
  listening: DEFAULT_LISTENING_CONFIG,
  thinking: DEFAULT_THINKING_CONFIG,
  speaking: DEFAULT_SPEAKING_CONFIG,
  muted: DEFAULT_MUTED_CONFIG,
  transition: DEFAULT_TRANSITION_CONFIG,
  particleColor: '#FFFFFF',
  backgroundColor: '#000000',
  particleSize: 4,
  radiusDispersion: 0,
};

// ===== 統一ビジュアライザーインターフェース =====

/**
 * 全てのビジュアライザーが実装すべき共通Props
 * プラグインとしてビジュアライザーを交換可能にするための統一インターフェース
 */
export interface BaseVisualizerProps {
  // オーディオ関連
  audioLevel: number;
  zcr?: number;
  rmsHigh?: number;

  // 状態
  state: VisualizerState;

  // 字幕テキスト
  transcript?: string;
  userTranscript?: string;
  showCaption?: boolean;

  // 表示設定
  width: number;
  height: number;
}

// ===== コンポーネントProps (Web版) =====

export interface ParticleVisualizerProps extends BaseVisualizerProps {
  faceData?: FacePointCloudSchema;
  config?: Partial<VisualizerConfig>;
  particleColor?: string;
}

// ===== カメラ設定 =====

export interface Camera {
  focalLength: number;
  position: Point3D;
}

export const DEFAULT_CAMERA: Camera = {
  focalLength: 300,
  position: { x: 0, y: 0, z: 200 },
};

// ===== イージング関数の型 =====

export type EasingFunction = (t: number) => number;
