import React, { useEffect, useRef } from 'react';
import type { VisualizerState } from './core/types';

interface StreamingTextVisualizerProps {
  audioLevel: number;
  state: VisualizerState;
  transcript?: string;
  userTranscript?: string;
  showCaption?: boolean;
  width: number;
  height: number;
  color: string;
}

export const StreamingTextVisualizer: React.FC<StreamingTextVisualizerProps> = ({
  audioLevel,
  state,
  transcript,
  userTranscript,
  showCaption = true,
  width,
  height,
  color,
}) => {
  // テキストのスケールアニメーション
  const textRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (textRef.current) {
      // 音声レベルに応じたスケール (1.0 - 1.2)
      const scale = 1 + audioLevel * 0.2;
      textRef.current.style.transform = `scale(${scale})`;
    }
  }, [audioLevel]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // --- グラフィック層のスタイル ---

  // コンテナスタイル
  const containerStyle: React.CSSProperties = {
    width,
    height,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '0 20px',
    overflow: 'hidden',
    position: 'relative',
  };

  // [グラフィック] ユーザー発話テキストスタイル（常に表示）
  const graphicUserTextStyle: React.CSSProperties = {
    position: 'absolute',
    top: '20%',
    fontSize: isMobile ? 14 : 18,
    color: color,
    opacity: 0.4, // 少し薄くして背景的に
    textAlign: 'center',
    maxWidth: '80%',
    fontWeight: 300,
    letterSpacing: '0.05em',
    transition: 'opacity 0.3s ease',
  };

  // [グラフィック] メインAIテキストスタイル（常に表示）
  const graphicAiTextStyle: React.CSSProperties = {
    fontSize: isMobile ? 28 : 42, // より大きく、インパクト重視
    fontWeight: 800,
    color: color,
    textAlign: 'center',
    letterSpacing: '0.02em',
    maxWidth: '90%',
    whiteSpace: 'pre-wrap', 
    wordBreak: 'break-word',
    // アニメーション設定
    transition: 'transform 0.05s ease-out',
    transformOrigin: 'center center',
    lineHeight: 1.2,
  };

  // --- 字幕層のスタイル (ParticleVisualizerWebと統一) ---

  const captionContainerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: isMobile ? 10 : 20,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: isMobile ? 'flex-start' : 'center',
    gap: isMobile ? 4 : 8,
    padding: '0 20px',
    pointerEvents: 'none',
    zIndex: 10, // グラフィックより手前に
  };

  const captionUserTextStyle: React.CSSProperties = {
    fontSize: isMobile ? 11 : 14,
    color: color,
    opacity: 0.6,
    textAlign: isMobile ? 'left' : 'center',
    textShadow: `0 0 4px ${color === '#FFFFFF' ? '#000' : '#FFF'}`,
  };

  const captionAiTextStyle: React.CSSProperties = {
    fontSize: isMobile ? 14 : 18,
    fontWeight: 600,
    color: color,
    textAlign: isMobile ? 'left' : 'center',
    textShadow: `0 0 6px ${color === '#FFFFFF' ? '#000' : '#FFF'}`,
    maxWidth: isMobile ? '95%' : '90%',
  };

  // 状態表示テキスト
  const getStatusText = () => {
    switch (state) {
      case 'listening': return 'Listening...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      case 'muted': return 'Muted';
      default: return '';
    }
  };

  // 表示するテキスト（グラフィック用）
  let displayGraphicText = transcript;
  if (!displayGraphicText) {
    displayGraphicText = getStatusText();
  }

  return (
    <div style={containerStyle}>
      {/* === グラフィック層 === */}
      
      {/* ユーザー発話（グラフィック） */}
      {userTranscript && (
        <div style={graphicUserTextStyle}>
          {userTranscript}
        </div>
      )}
      
      {/* AI発話（グラフィック） */}
      <div ref={textRef} style={graphicAiTextStyle}>
        {displayGraphicText}
      </div>

      {/* === 字幕層 === */}
      {showCaption && (userTranscript || transcript) && (
        <div style={captionContainerStyle}>
          {userTranscript && (
            <div style={captionUserTextStyle}>{userTranscript}</div>
          )}
          {transcript && (
            <div style={captionAiTextStyle}>{transcript}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default StreamingTextVisualizer;
