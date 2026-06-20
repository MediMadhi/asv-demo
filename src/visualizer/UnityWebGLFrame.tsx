import React, { useCallback, useEffect, useRef } from 'react';
import type { VisualizerState } from './core/types';

interface UnityWebGLFrameProps {
  width: number;
  height: number;
  color: string;
  backgroundColor: string;
  audioLevel?: number;
  zcr?: number;
  rmsHigh?: number;
  state?: VisualizerState;
  src?: string;
}

export const UnityWebGLFrame: React.FC<UnityWebGLFrameProps> = ({
  width,
  height,
  color,
  backgroundColor,
  audioLevel = 0,
  zcr = 0,
  rmsHigh = 0,
  state = 'listening',
  src = `${import.meta.env.BASE_URL}unity-webgl-demo/index.html`,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);

  // 最新の駆動データを保持（ready 通知到着時にまとめて流すため）
  const latestRef = useRef({ audioLevel, zcr, rmsHigh, state, color, backgroundColor });
  latestRef.current = { audioLevel, zcr, rmsHigh, state, color, backgroundColor };

  const send = useCallback(() => {
    if (!readyRef.current) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const v = latestRef.current;
    win.postMessage(
      {
        type: 'asv-frame',
        payload: JSON.stringify({
          audioLevel: v.audioLevel,
          zcr: v.zcr,
          rmsHigh: v.rmsHigh,
          state: v.state,
          color: v.color,
          background: v.backgroundColor,
        }),
      },
      '*',
    );
  }, []);

  // Unity ロード完了通知を受けたら送信開始（初回フルフレームを流す）
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'asv-unity-ready') {
        readyRef.current = true;
        send();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [send]);

  // 会話パターン由来の値が変わるたびに Unity へ転送
  useEffect(() => {
    send();
  }, [audioLevel, zcr, rmsHigh, state, color, backgroundColor, send]);

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        backgroundColor,
      }}
    >
      <iframe
        ref={iframeRef}
        title="Unity WebGL Demo"
        src={src}
        allow="autoplay; fullscreen; xr-spatial-tracking; gamepad"
        allowFullScreen
        loading="lazy"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          backgroundColor,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 12,
          bottom: 10,
          color,
          fontSize: 10,
          letterSpacing: '0.08em',
          opacity: 0.45,
          pointerEvents: 'none',
          textTransform: 'uppercase',
        }}
      >
        Unity WebGL
      </div>
    </div>
  );
};

export default UnityWebGLFrame;
