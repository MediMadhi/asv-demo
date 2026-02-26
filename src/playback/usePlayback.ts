/**
 * usePlayback Hook
 *
 * 再生エンジンをReactコンポーネントで使用するためのフック
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PlaybackEngine } from './PlaybackEngine';
import type {
  ConversationLog,
  PlaybackStatus,
  LoggedState,
} from './types';

export interface UsePlaybackReturn {
  // 状態
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  isLoaded: boolean;
  progress: number; // 0-1

  // ビジュアライザー用
  state: LoggedState;
  audioLevel: number;
  zcr: number;
  rmsHigh: number;

  // テキスト
  userTranscript: string;
  aiTranscript: string;

  // 操作
  load: (log: ConversationLog) => void;
  loadFromJson: (json: string) => void;
  loadFromFile: (file: File) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (timeMs: number) => void;
  setSpeed: (speed: number) => void;
  setMuted: (muted: boolean) => void;
  setUserAudioGain: (gain: number) => void;
}

export const usePlayback = (): UsePlaybackReturn => {
  const engineRef = useRef<PlaybackEngine | null>(null);

  // 状態
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // ビジュアライザー用
  const [state, setState] = useState<LoggedState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [zcr, setZcr] = useState(0);
  const [rmsHigh, setRmsHigh] = useState(0);

  // テキスト
  const [userTranscript, setUserTranscript] = useState('');
  const [aiTranscript, setAiTranscript] = useState('');

  // 前の状態を追跡（speakingから他の状態に変わったときにキャプションをクリアするため）
  const prevStateRef = useRef<LoggedState>('idle');

  // エンジン初期化
  useEffect(() => {
    const engine = new PlaybackEngine();
    engineRef.current = engine;

    engine.setCallbacks({
      onStateChange: (newState) => {
        // speakingから他の状態に変わったらキャプションをクリア
        if (prevStateRef.current === 'speaking' && newState !== 'speaking') {
          setAiTranscript('');
          setUserTranscript('');
        }
        prevStateRef.current = newState;
        setState(newState);
      },
      onAudioLevel: (rms, zcrVal, rmsHighVal) => {
        setAudioLevel(rms);
        setZcr(zcrVal ?? 0);
        setRmsHigh(rmsHighVal ?? 0);
      },
      onUserTranscript: (text, isFinal) => {
        if (isFinal) {
          setUserTranscript(text);
        }
      },
      onAiTranscript: (text) => {
        // チャンク単位でテキストを受け取る（updateChunkDisplayから呼ばれる）
        // 現在のチャンクテキストをそのまま設定
        if (text) {
          setAiTranscript(text);
        }
      },
      onProgress: (time, total) => {
        setCurrentTime(time);
        setDuration(total);
      },
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        // 再生終了時にテキストをクリア
        if (newStatus === 'ended' || newStatus === 'idle') {
          setUserTranscript('');
          setAiTranscript('');
        }
      },
      onUserAudio: (_pcmBase64) => {
        // ユーザー音声再生時のコールバック（現在は何もしない、将来の拡張用）
        // 音声自体の再生はPlaybackEngine内で行われる
      },
    });

    return () => {
      engine.dispose();
    };
  }, []);

  // ログをロード
  const load = useCallback((log: ConversationLog) => {
    if (!engineRef.current) return;
    engineRef.current.load(log);
    setIsLoaded(true);
    setDuration(log.meta.duration ?? 0);
    setState('idle');
    setAudioLevel(0);
    setUserTranscript('');
    setAiTranscript('');
  }, []);

  // JSONからロード
  const loadFromJson = useCallback((json: string) => {
    if (!engineRef.current) return;
    engineRef.current.loadFromJson(json);
    setIsLoaded(true);
    setDuration(engineRef.current.getDuration());
    setState('idle');
    setAudioLevel(0);
    setUserTranscript('');
    setAiTranscript('');
  }, []);

  // ファイルからロード
  const loadFromFile = useCallback(async (file: File) => {
    const text = await file.text();
    loadFromJson(text);
  }, [loadFromJson]);

  // 再生
  const play = useCallback(() => {
    engineRef.current?.play();
  }, []);

  // 一時停止
  const pause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  // 停止
  const stop = useCallback(() => {
    engineRef.current?.stop();
    setState('idle');
    setAudioLevel(0);
  }, []);

  // シーク
  const seek = useCallback((timeMs: number) => {
    engineRef.current?.seek(timeMs);
  }, []);

  // 速度設定
  const setSpeed = useCallback((speed: number) => {
    engineRef.current?.setSpeed(speed);
  }, []);

  // ミュート設定
  const setMuted = useCallback((muted: boolean) => {
    engineRef.current?.setMuted(muted);
  }, []);

  // ユーザー音声ゲイン設定（1.0 = 等倍、3.0 = 3倍増幅）
  const setUserAudioGain = useCallback((gain: number) => {
    engineRef.current?.setUserAudioGain(gain);
  }, []);

  // 進捗率
  const progress = duration > 0 ? currentTime / duration : 0;

  return {
    status,
    currentTime,
    duration,
    isLoaded,
    progress,
    state,
    audioLevel,
    zcr,
    rmsHigh,
    userTranscript,
    aiTranscript,
    load,
    loadFromJson,
    loadFromFile,
    play,
    pause,
    stop,
    seek,
    setSpeed,
    setMuted,
    setUserAudioGain,
  };
};
