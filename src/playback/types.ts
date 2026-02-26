/**
 * Playback Engine Types
 *
 * conversationLogger.tsと互換性のある型定義
 */

/** 会話状態 */
export type LoggedState = 'idle' | 'listening' | 'processing' | 'speaking' | 'muted';

/** ログエントリの種類 */
export type LogEntryType = 'stateChange' | 'audio' | 'userTranscript' | 'aiTranscript' | 'aiAudio' | 'userAudio';

/** 基本ログエントリ */
interface BaseLogEntry {
  /** セッション開始からの経過時間 (ms) */
  timestamp: number;
  /** エントリの種類 */
  type: LogEntryType;
}

/** 状態変更ログ */
export interface StateChangeEntry extends BaseLogEntry {
  type: 'stateChange';
  state: LoggedState;
  previousState?: LoggedState;
}

/** 音声レベルログ */
export interface AudioEntry extends BaseLogEntry {
  type: 'audio';
  rms: number;
  zcr?: number;
  rmsHigh?: number;
}

/** ユーザー音声認識テキスト */
export interface UserTranscriptEntry extends BaseLogEntry {
  type: 'userTranscript';
  text: string;
  isFinal: boolean;
}

/** AI応答テキスト */
export interface AiTranscriptEntry extends BaseLogEntry {
  type: 'aiTranscript';
  text: string;
  /** 差分テキスト（ストリーミング用） */
  delta?: string;
}

/** AI音声データ（PCM16 Base64） */
export interface AiAudioEntry extends BaseLogEntry {
  type: 'aiAudio';
  /** PCM16 24kHz モノラル Base64エンコード */
  pcm: string;
}

/** ユーザー音声データ（PCM16 Base64） */
export interface UserAudioEntry extends BaseLogEntry {
  type: 'userAudio';
  /** PCM16 24kHz モノラル Base64エンコード */
  pcm: string;
  /** ユーザー発話の想定長さ (ms) */
  durationMs?: number;
}

/** ログエントリの共用体型 */
export type LogEntry = StateChangeEntry | AudioEntry | UserTranscriptEntry | AiTranscriptEntry | AiAudioEntry | UserAudioEntry;

/** セッションメタデータ */
export interface SessionMetadata {
  /** セッションID */
  sessionId: string;
  /** 開始日時 (ISO文字列) */
  startedAt: string;
  /** 終了日時 (ISO文字列) */
  endedAt?: string;
  /** 総時間 (ms) */
  duration?: number;
  /** アプリバージョン */
  appVersion?: string;
  /** デバイス情報 */
  device?: string;
}

/** 会話ログデータ */
export interface ConversationLog {
  meta: SessionMetadata;
  entries: LogEntry[];
}

/** 再生状態 */
export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'ended';

/** 再生イベントコールバック */
export interface PlaybackCallbacks {
  onStateChange?: (state: LoggedState) => void;
  onAudioLevel?: (rms: number, zcr?: number, rmsHigh?: number) => void;
  onUserTranscript?: (text: string, isFinal: boolean) => void;
  onAiTranscript?: (text: string, delta?: string) => void;
  onAiAudio?: (pcmBase64: string) => void;
  onUserAudio?: (pcmBase64: string) => void;
  onProgress?: (currentTime: number, totalDuration: number) => void;
  onStatusChange?: (status: PlaybackStatus) => void;
}
