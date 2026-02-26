/**
 * Playback Engine
 *
 * 会話ログを時間に沿って再生するエンジン
 * Web Audio APIを使用してPCM16音声を再生
 */

import type {
  ConversationLog,
  LogEntry,
  PlaybackStatus,
  PlaybackCallbacks,
  LoggedState,
} from './types';

/** 字幕同期用のチャンク型定義 */
interface TranscriptChunk {
  text: string;
  estimatedStartTime: number; // 推定開始時刻（再生開始からのms）
}

/** 表示オフセット（ms）- テキストが音声より先に到着するため、表示を遅らせる */
const DISPLAY_OFFSET_MS = 1000;

/** PCM16 Base64をFloat32 AudioBufferに変換 */
const pcm16ToAudioBuffer = (
  audioContext: AudioContext,
  pcmBase64: string
): AudioBuffer | null => {
  try {
    // Base64デコード
    const binaryString = atob(pcmBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Int16配列に変換（リトルエンディアン）
    const int16Array = new Int16Array(bytes.buffer);

    // Float32に変換（-1.0 ~ 1.0）
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    // AudioBuffer作成（24kHz, モノラル）
    const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
    audioBuffer.copyToChannel(float32Array, 0);

    return audioBuffer;
  } catch (e) {
    console.error('[PlaybackEngine] Failed to decode PCM16:', e);
    return null;
  }
};

export class PlaybackEngine {
  private log: ConversationLog | null = null;
  private callbacks: PlaybackCallbacks = {};
  private status: PlaybackStatus = 'idle';
  private currentTime: number = 0;
  private entryIndex: number = 0;
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  private playbackSpeed: number = 1.0;

  /** 現在の状態（ビジュアライザー用） */
  private currentState: LoggedState = 'idle';
  private currentRms: number = 0;
  private currentZcr: number = 0;
  private currentRmsHigh: number = 0;

  /** Web Audio API */
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private userGainNode: GainNode | null = null; // ユーザー音声用（増幅）
  private isMuted: boolean = false;
  private nextAudioStartTime: number = 0;
  private currentSource: AudioBufferSourceNode | null = null;

  /** ユーザー音声のゲイン倍率（デフォルト3倍） */
  private userAudioGain: number = 3.0;

  /** 字幕同期用 */
  private pendingText: string = '';
  private transcriptChunks: TranscriptChunk[] = [];
  private displayedChunkIndex: number = 0;
  private audioEnqueuedDurationMs: number = 0;
  private pendingChunkStartTime: number = 0;
  private playbackStartedAt: number = 0;
  private aiAudioStartContextTime: number | null = null;

  /** ログをロード */
  load(log: ConversationLog): void {
    this.log = log;
    this.reset();

    // AudioContext初期化（ユーザーインタラクション後に自動的にresumeされる）
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      // GainNodeを作成してdestinationに接続（ミュート制御用）
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.isMuted ? 0 : 1;

      // ユーザー音声用GainNode（増幅用）
      this.userGainNode = this.audioContext.createGain();
      this.userGainNode.connect(this.gainNode); // ミュート制御を通す
      this.userGainNode.gain.value = this.userAudioGain;

    }

    console.log('[PlaybackEngine] Loaded log:', log.meta.sessionId, 'entries:', log.entries.length);
  }

  /** JSONからロード */
  loadFromJson(json: string): void {
    try {
      const log = JSON.parse(json) as ConversationLog;
      this.load(log);
    } catch (e) {
      console.error('[PlaybackEngine] Failed to parse JSON:', e);
      throw new Error('Invalid conversation log format');
    }
  }

  /** コールバックを設定 */
  setCallbacks(callbacks: PlaybackCallbacks): void {
    this.callbacks = callbacks;
  }

  /** 再生速度を設定 */
  setSpeed(speed: number): void {
    this.playbackSpeed = Math.max(0.1, Math.min(4.0, speed));
  }

  /** ミュート設定 */
  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.gainNode) {
      this.gainNode.gain.value = muted ? 0 : 1;
    }
  }

  /** ミュート状態を取得 */
  getMuted(): boolean {
    return this.isMuted;
  }

  /** ユーザー音声のゲインを設定（1.0 = 等倍、3.0 = 3倍増幅） */
  setUserAudioGain(gain: number): void {
    this.userAudioGain = Math.max(0.1, Math.min(10.0, gain));
    if (this.userGainNode) {
      this.userGainNode.gain.value = this.userAudioGain;
    }
  }

  /** ユーザー音声のゲインを取得 */
  getUserAudioGain(): number {
    return this.userAudioGain;
  }

  /** 再生開始 */
  play(): void {
    if (!this.log) {
      console.warn('[PlaybackEngine] No log loaded');
      return;
    }

    if (this.status === 'ended') {
      this.reset();
    }

    // AudioContextをresumeする（ブラウザのautoplay policy対応）
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }

    this.status = 'playing';
    this.callbacks.onStatusChange?.('playing');
    this.lastFrameTime = performance.now();
    this.nextAudioStartTime = this.audioContext?.currentTime ?? 0;

    // 字幕同期: 再生開始時刻を記録
    if (this.playbackStartedAt === 0) {
      this.playbackStartedAt = performance.now();
    }

    this.tick();
  }

  /** 一時停止 */
  pause(): void {
    if (this.status !== 'playing') return;

    this.status = 'paused';
    this.callbacks.onStatusChange?.('paused');

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // 音声を一時停止
    this.stopAllAudio();
  }

  /** 全ての音声を停止 */
  private stopAllAudio(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // 既に停止している場合は無視
      }
      this.currentSource = null;
    }
  }

  /** 停止（先頭に戻る） */
  stop(): void {
    this.pause();
    this.reset();
    this.status = 'idle';
    this.callbacks.onStatusChange?.('idle');
  }

  /** 特定の時間にシーク */
  seek(timeMs: number): void {
    if (!this.log) return;

    this.currentTime = Math.max(0, Math.min(timeMs, this.getDuration()));
    this.entryIndex = 0;

    // 現在時刻より前のエントリを全て処理して状態を復元
    while (
      this.entryIndex < this.log.entries.length &&
      this.log.entries[this.entryIndex].timestamp <= this.currentTime
    ) {
      this.processEntry(this.log.entries[this.entryIndex], true);
      this.entryIndex++;
    }

    this.callbacks.onProgress?.(this.currentTime, this.getDuration());
  }

  /** リセット */
  reset(): void {
    this.currentTime = 0;
    this.entryIndex = 0;
    this.currentState = 'idle';
    this.currentRms = 0;
    this.currentZcr = 0;
    this.currentRmsHigh = 0;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // 音声をリセット
    this.stopAllAudio();
    this.nextAudioStartTime = 0;

    // 字幕同期をリセット
    this.resetSubtitleSync();
  }

  /** 再生状態を取得 */
  getStatus(): PlaybackStatus {
    return this.status;
  }

  /** 現在の再生時間を取得 */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /** 総再生時間を取得 */
  getDuration(): number {
    return this.log?.meta.duration ?? 0;
  }

  /** ログがロードされているか */
  isLoaded(): boolean {
    return this.log !== null;
  }

  /** 現在の状態を取得（ビジュアライザー用） */
  getCurrentState(): LoggedState {
    return this.currentState;
  }

  /** 現在の音声レベルを取得 */
  getAudioLevels(): { rms: number; zcr: number; rmsHigh: number } {
    return {
      rms: this.currentRms,
      zcr: this.currentZcr,
      rmsHigh: this.currentRmsHigh,
    };
  }

  /** テキストをチャンクに分割（句点区切り） */
  private splitIntoChunks(text: string): string[] {
    // 句点、感嘆符、疑問符、改行で分割（区切り文字を含める）
    const chunks = text.split(/(?<=[。！？\n])/);
    return chunks.filter(c => c.trim().length > 0);
  }

  /** 新しいテキストデルタを処理してチャンクに追加 */
  private processTranscriptDelta(delta: string): void {
    // pendingが空なら、これが新しいチャンクの最初の文字 → 現在の音声位置を記録
    if (this.pendingText.trim().length === 0) {
      this.pendingChunkStartTime = this.audioEnqueuedDurationMs;
    }

    this.pendingText += delta;

    // 句点があればチャンクとして確定
    const chunks = this.splitIntoChunks(this.pendingText);
    if (chunks.length > 1) {
      // 最後以外はチャンクとして追加
      for (let i = 0; i < chunks.length - 1; i++) {
        const chunkText = chunks[i];
        // チャンクの最初の文字が到着した時点での音声位置を使用
        const estimatedStartTime = this.pendingChunkStartTime;
        this.transcriptChunks.push({ text: chunkText, estimatedStartTime });
      }
      // 最後のチャンクは次のデルタと結合するため保持
      this.pendingText = chunks[chunks.length - 1];
      // 次のチャンクの開始位置を現在の音声位置に更新
      this.pendingChunkStartTime = this.audioEnqueuedDurationMs;
    }
  }

  /** 残りのテキストを最終チャンクとして追加 */
  private flushPendingText(): void {
    if (this.pendingText.trim()) {
      const estimatedStartTime = this.pendingChunkStartTime;
      this.transcriptChunks.push({ text: this.pendingText, estimatedStartTime });
      this.pendingText = '';
    }
  }

  /** AI音声の再生経過時間を取得（ms） */
  private getAiAudioElapsedMs(): number | null {
    if (!this.audioContext || this.aiAudioStartContextTime === null) return null;

    const now = this.audioContext.currentTime;
    if (now < this.aiAudioStartContextTime) return 0;

    const clampedNow = Math.min(now, this.nextAudioStartTime);
    const elapsedSec = clampedNow - this.aiAudioStartContextTime;
    return Math.max(0, elapsedSec * 1000);
  }

  /** チャンク表示を更新（再生経過時間に基づく） */
  private updateChunkDisplay(): void {
    const elapsedMs = this.getAiAudioElapsedMs();
    if (elapsedMs === null) return;
    let updated = false;

    while (
      this.displayedChunkIndex < this.transcriptChunks.length &&
      this.transcriptChunks[this.displayedChunkIndex].estimatedStartTime + DISPLAY_OFFSET_MS <= elapsedMs
    ) {
      this.displayedChunkIndex++;
      updated = true;
    }

    if (updated) {
      // 現在のチャンク（最新の表示開始チャンク）のみを表示
      const currentIndex = this.displayedChunkIndex - 1;
      if (currentIndex >= 0 && currentIndex < this.transcriptChunks.length) {
        const currentChunk = this.transcriptChunks[currentIndex];
        // コールバックで現在のチャンクテキストを通知
        this.callbacks.onAiTranscript?.(currentChunk.text, undefined);
      }
    }
  }

  /** 字幕同期のリセット */
  private resetSubtitleSync(): void {
    this.pendingText = '';
    this.transcriptChunks = [];
    this.displayedChunkIndex = 0;
    this.audioEnqueuedDurationMs = 0;
    this.pendingChunkStartTime = 0;
    this.playbackStartedAt = 0;
    this.aiAudioStartContextTime = null;
  }

  /** メインループ */
  private tick = (): void => {
    if (this.status !== 'playing' || !this.log) {
      return;
    }

    const now = performance.now();
    const deltaMs = (now - this.lastFrameTime) * this.playbackSpeed;
    this.lastFrameTime = now;

    this.currentTime += deltaMs;

    // 現在時刻までのエントリを処理
    while (
      this.entryIndex < this.log.entries.length &&
      this.log.entries[this.entryIndex].timestamp <= this.currentTime
    ) {
      this.processEntry(this.log.entries[this.entryIndex], false);
      this.entryIndex++;
    }

    // 字幕同期: チャンク表示を更新
    this.updateChunkDisplay();

    // 進捗コールバック
    this.callbacks.onProgress?.(this.currentTime, this.getDuration());

    // 終了チェック
    if (this.currentTime >= this.getDuration()) {
      this.status = 'ended';
      this.callbacks.onStatusChange?.('ended');
      return;
    }

    // 次フレーム
    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  /** エントリを処理 */
  private processEntry(entry: LogEntry, silent: boolean): void {
    switch (entry.type) {
      case 'stateChange':
        this.currentState = entry.state;
        if (!silent) {
          this.callbacks.onStateChange?.(entry.state);
        }
        break;

      case 'audio':
        this.currentRms = entry.rms;
        this.currentZcr = entry.zcr ?? 0;
        this.currentRmsHigh = entry.rmsHigh ?? 0;
        if (!silent) {
          this.callbacks.onAudioLevel?.(entry.rms, entry.zcr, entry.rmsHigh);
        }
        break;

      case 'userTranscript':
        if (!silent) {
          this.callbacks.onUserTranscript?.(entry.text, entry.isFinal);
        }
        break;

      case 'aiTranscript':
        if (!silent) {
          if (entry.delta) {
            // 字幕同期: デルタテキストをチャンクに追加
            this.processTranscriptDelta(entry.delta);
          } else if (entry.text) {
            // 最終テキスト: 残りのテキストをフラッシュ
            this.flushPendingText();
          }
          // 注: onAiTranscriptはupdateChunkDisplayから呼ばれるため、ここでは呼ばない
        }
        break;

      case 'aiAudio':
        if (!silent) {
          // 字幕同期: 音声エンキュー済み累積時間を更新
          // PCM16 24kHz: バイト数 / 2（サンプル数） / 24000 * 1000 = バイト数 / 48
          try {
            const pcmBytes = atob(entry.pcm).length;
            const chunkDurationMs = (pcmBytes / 48) / this.playbackSpeed;
            this.audioEnqueuedDurationMs += chunkDurationMs;
          } catch (e) {
            // Base64デコード失敗時は無視
          }
          this.playAudioChunk(entry.pcm);
          this.callbacks.onAiAudio?.(entry.pcm);
        }
        break;

      case 'userAudio':
        if (!silent) {
          // ユーザー音声を再生（増幅して再生）
          this.playAudioChunk(entry.pcm, true, entry.durationMs);
          this.callbacks.onUserAudio?.(entry.pcm);
        }
        break;
    }
  }

  /** PCM音声チャンクを再生 */
  private playAudioChunk(pcmBase64: string, isUserAudio: boolean = false, targetDurationMs?: number): void {
    if (!this.audioContext) return;

    const audioBuffer = pcm16ToAudioBuffer(this.audioContext, pcmBase64);
    if (!audioBuffer) return;

    // AudioBufferSourceNodeを作成して再生
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // ユーザー音声は増幅用GainNode経由、AI音声は通常のGainNode経由
    if (isUserAudio && this.userGainNode) {
      source.connect(this.userGainNode);
    } else {
      source.connect(this.gainNode || this.audioContext.destination);
    }

    // 再生速度を調整
    let playbackRate = this.playbackSpeed;
    if (isUserAudio && targetDurationMs !== undefined && targetDurationMs > 0) {
      const desiredRate = audioBuffer.duration / (targetDurationMs / 1000);
      const clampedRate = Math.max(0.5, Math.min(2.0, desiredRate));
      playbackRate = clampedRate * this.playbackSpeed;
    }
    source.playbackRate.value = playbackRate;

    // スケジュールされた時間に再生開始
    const now = this.audioContext.currentTime;
    const previousNextAudioStartTime = this.nextAudioStartTime;
    const startTime = Math.max(now, previousNextAudioStartTime);
    if (!isUserAudio) {
      if (this.aiAudioStartContextTime === null) {
        this.aiAudioStartContextTime = startTime;
      } else if (startTime > previousNextAudioStartTime) {
        const gap = startTime - previousNextAudioStartTime;
        this.aiAudioStartContextTime += gap;
      }
    }

    source.start(startTime);

    // 次のチャンクの開始時間を計算
    const duration = audioBuffer.duration / playbackRate;
    this.nextAudioStartTime = startTime + duration;

    // 現在のソースを保持（停止用）
    this.currentSource = source;
  }

  /** リソース解放 */
  dispose(): void {
    this.stop();
    this.log = null;
    this.callbacks = {};

    // AudioContextをクローズ
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// シングルトンインスタンス
let sharedEngine: PlaybackEngine | null = null;

export const getPlaybackEngine = (): PlaybackEngine => {
  if (!sharedEngine) {
    sharedEngine = new PlaybackEngine();
  }
  return sharedEngine;
};

export const disposePlaybackEngine = (): void => {
  if (sharedEngine) {
    sharedEngine.dispose();
    sharedEngine = null;
  }
};
