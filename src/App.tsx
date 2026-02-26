import { useState, useEffect, useCallback, useRef } from 'react';
import { ParticleVisualizerWeb, FloatingParticlesVisualizer, StreamingTextVisualizer } from './visualizer';
import type { VisualizerState } from './visualizer';
import { usePlayback } from './playback';
import type { LoggedState } from './playback';
import { patterns as preloadedPatterns } from './patterns';
import './index.css';

// LoggedState から VisualizerState への変換
const toVisualizerState = (state: LoggedState): VisualizerState => {
  switch (state) {
    case 'idle':
    case 'listening':
      return 'listening';
    case 'processing':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'muted':
      return 'muted';
    default:
      return 'listening';
  }
};

type ThemeMode = 'system' | 'light' | 'dark';
type VisualizerType = 'particle' | 'floating' | 'text' | 'waveform' | 'minimal';

// ビジュアライザー情報
interface VisualizerInfo {
  id: VisualizerType;
  name: string;
  description: string;
  available: boolean;
  particleCount?: number;
}

const VISUALIZERS: VisualizerInfo[] = [
  { id: 'particle', name: 'Orbital Particles', description: 'Particles orbiting in circular formation (40 particles)', available: true, particleCount: 40 },
  { id: 'floating', name: 'Circular Particle Field', description: 'Rich floating particles with dispersion (500 particles)', available: true, particleCount: 500 },
  { id: 'text', name: 'Streaming Text', description: 'Dynamic text visualization with audio reactivity', available: true },
  { id: 'waveform', name: 'Waveform', description: 'Audio waveform bars', available: false },
  { id: 'minimal', name: 'Minimal', description: 'Simple dot indicator', available: false },
];

// システムのダークモード設定を取得
const getSystemDarkMode = (): boolean => {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return true;
};

// ミニイコライザーコンポーネント（コンパクト版）
interface MiniEqualizerProps {
  level: number; // 0-1
  zcr?: number;  // 0-1 (高周波の指標)
  rmsHigh?: number; // 0-1
  columns?: number;
  rows?: number;
  color?: string;
}

const MiniEqualizer: React.FC<MiniEqualizerProps> = ({
  level,
  zcr = 0,
  rmsHigh = 0,
  columns = 10,
  rows = 6,
  color = '#FFFFFF',
}) => {
  const barWidth = 5;
  const barHeight = 2; // 高さを半分以下に

  // 各列のレベルを計算（スペクトラム風の変化）
  const getColumnLevel = (colIndex: number): number => {
    const center = columns / 2;
    const distFromCenter = Math.abs(colIndex - center) / center;

    // 基本レベル + ZCR/RmsHighによる変調
    const baseVariation = Math.sin(colIndex * 0.8 + level * 10) * 0.15;
    const zcrEffect = zcr * (1 - distFromCenter) * 0.3;
    const highEffect = rmsHigh * distFromCenter * 0.4;

    const colLevel = level + baseVariation + zcrEffect + highEffect;
    return Math.max(0, Math.min(1, colLevel));
  };

  return (
    <div style={{ display: 'flex', gap: '1px' }}>
      {Array.from({ length: columns }, (_, colIndex) => {
        const colLevel = getColumnLevel(colIndex);
        const litBars = Math.floor(colLevel * rows);

        return (
          <div
            key={colIndex}
            style={{
              display: 'flex',
              flexDirection: 'column-reverse',
              gap: '1px',
            }}
          >
            {Array.from({ length: rows }, (_, rowIndex) => {
              const isLit = rowIndex < litBars;
              return (
                <div
                  key={rowIndex}
                  style={{
                    width: barWidth,
                    height: barHeight,
                    backgroundColor: color,
                    opacity: isLit ? 0.9 : 0.15,
                    transition: 'opacity 0.05s',
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

// テキストスクランブルアニメーションコンポーネント
interface ScrambleTextProps {
  text: string;
  color?: string;
  showDots?: boolean;
}

const ScrambleText: React.FC<ScrambleTextProps> = ({ text, color = '#FFFFFF', showDots = true }) => {
  const [displayText, setDisplayText] = useState(text);
  const [dots, setDots] = useState('');
  const prevTextRef = useRef(text);
  const isScrambling = useRef(false);

  // ランダム文字の候補
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // スクランブルアニメーション
  useEffect(() => {
    // テキストが変わった時のみアニメーション
    if (prevTextRef.current === text) return;
    prevTextRef.current = text;
    isScrambling.current = true;

    const targetText = text.toUpperCase();
    const textLength = targetText.length;
    let settledCount = 0;

    // アニメーション間隔
    const intervalId = setInterval(() => {
      setDisplayText(() => {
        let newText = '';
        for (let i = 0; i < textLength; i++) {
          if (i < settledCount) {
            // 確定済みの文字
            newText += targetText[i];
          } else if (targetText[i] === ' ') {
            // スペースはそのまま
            newText += ' ';
          } else {
            // ランダム文字
            newText += chars[Math.floor(Math.random() * chars.length)];
          }
        }
        return newText;
      });
    }, 30);

    // 左から順に確定していく
    const settleIntervalId = setInterval(() => {
      settledCount++;
      if (settledCount >= textLength) {
        clearInterval(intervalId);
        clearInterval(settleIntervalId);
        setDisplayText(targetText);
        isScrambling.current = false;
      }
    }, 60);

    return () => {
      clearInterval(intervalId);
      clearInterval(settleIntervalId);
    };
  }, [text, chars]);

  // ドットアニメーション（左から順に表示→一気に非表示のループ）
  useEffect(() => {
    if (!showDots) return;

    let dotCount = 0;
    const maxDots = 2;

    const dotInterval = setInterval(() => {
      // スクランブル中はドット非表示
      if (isScrambling.current) {
        setDots('');
        dotCount = 0;
        return;
      }

      dotCount++;
      if (dotCount > maxDots) {
        // 2つ表示したら一気にリセット
        dotCount = 0;
      }
      setDots('.'.repeat(dotCount));
    }, 150);

    return () => clearInterval(dotInterval);
  }, [showDots]);

  // 初回マウント時はアニメーションなし
  useEffect(() => {
    setDisplayText(text.toUpperCase());
  }, []);

  return (
    <span style={{
      color,
      fontFamily: 'monospace',
      letterSpacing: '0.1em',
    }}>
      {displayText}
      {showDots && <span style={{ opacity: 0.7 }}>{dots}</span>}
    </span>
  );
};

// ビジュアライザーサイズを計算（レスポンシブ対応）
const calculateVisualizerSize = (): { width: number; height: number } => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // コントロールは右下に浮いているため、ほぼ全画面使える
  const padding = 40;
  const availableHeight = vh - padding;
  const availableWidth = vw - padding;

  // 正方形を維持しつつ、利用可能な領域に収める
  let size = Math.min(availableWidth, availableHeight);

  // 最小・最大サイズ制限
  size = Math.max(280, Math.min(size, 900));

  return { width: size, height: size };
};

// Auto Demo用の特別なパターンID
const AUTO_DEMO_ID = '__auto_demo__';

function App() {
  // Auto Demo用の状態
  const [autoState, setAutoState] = useState<VisualizerState>('listening');
  const [autoAudioLevel, setAutoAudioLevel] = useState(0);
  const [autoProgress, setAutoProgress] = useState(0); // Auto用プログレス（0-1）

  // テーマ設定
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [systemDarkMode, setSystemDarkMode] = useState(getSystemDarkMode);

  // システム設定の変更を監視
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemDarkMode(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // 実際のダークモード状態を計算
  const isDarkMode = themeMode === 'system' ? systemDarkMode : themeMode === 'dark';
  const [dimensions, setDimensions] = useState(calculateVisualizerSize);
  const [isWideScreen, setIsWideScreen] = useState(window.innerWidth > 768);

  // 再生エンジン
  const playback = usePlayback();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // プリセットパターン（ビルド時に自動検出済み）
  // APIから取得したパターンとマージする
  const [patterns, setPatterns] = useState(preloadedPatterns);

  // パターン一覧をAPIから再取得
  const fetchPatterns = useCallback(async () => {
    try {
      // 開発サーバーのAPIを叩く（Viteのプロキシ設定が必要な場合あり）
      // プロキシがない場合は直接ポート指定が必要かも知れないが、通常は相対パスでOK
      const res = await fetch('/api/patterns');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.patterns)) {
          // APIから返ってくるのはメタデータのみかもしれないので、詳細が必要なら個別に取得するか
          // ここでは簡易的にファイル名ベースで既存のpreloadedPatternsとマージ、あるいは
          // サーバー上のファイルを正とするならサーバーのデータを優先
          // しかしpreloadedPatternsは中身（entries）を持っているので、
          // サーバーから取得したリストに中身がない場合はロードが必要。
          // 簡易実装: サーバーにあるファイル名リストと一致するものだけを表示、
          // またはサーバーから全データを取得するエンドポイントが必要。
          
          // 今回は「削除機能」がメインなので、サーバー上のファイルリストを正とします。
          // ただし、静的ビルド（サーバーなし）の場合はpreloadedPatternsを使う。
          
          // サーバー上のファイル名リストを取得
          const serverFilenames = new Set(data.patterns.map((p: any) => p.filename));
          
          // preloadedPatternsのうち、サーバーにもあるもの（またはサーバーが空なら全て）を表示
          // ※ 本来はサーバーからデータをロードすべきだが、今回はpreloadedPatternsを活用
          const mergedPatterns = preloadedPatterns.filter(p => serverFilenames.has(p.filename));
          
          if (mergedPatterns.length > 0) {
             setPatterns(mergedPatterns);
          } else if (serverFilenames.size > 0) {
             // preloadedにない新しいパターンがサーバーにある場合（動的追加）
             // 本来は個別にfetchすべきだが、今回はリロード推奨とするか、
             // preloadedPatternsが古くなっている可能性を考慮
             console.log('New patterns detected on server, reload might be required');
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch patterns from API (Dev Server might be offline):', e);
      // エラー時はプリセットをそのまま使用
    }
  }, []);

  // 初回ロード時にパターン同期
  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  // パターン削除（個別）
  const deletePattern = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 選択イベントのバブリング防止
    if (!window.confirm('Are you sure you want to delete this pattern?')) return;

    try {
      const res = await fetch(`/api/patterns/${id}`, { method: 'DELETE' });
      if (res.ok) {
        // リストから除外
        setPatterns(prev => prev.filter(p => p.id !== id));
        if (selectedPatternId === id) {
          setSelectedPatternId(AUTO_DEMO_ID);
          playback.stop();
        }
      } else {
        alert('Failed to delete pattern');
      }
    } catch (e) {
      console.error('Delete failed:', e);
      alert('Failed to delete pattern (API error)');
    }
  };

  // パターン全削除
  const deleteAllPatterns = async () => {
    if (!window.confirm('Are you sure you want to DELETE ALL patterns? This cannot be undone.')) return;

    try {
      const res = await fetch('/api/patterns', { method: 'DELETE' });
      if (res.ok) {
        setPatterns([]);
        setSelectedPatternId(AUTO_DEMO_ID);
        playback.stop();
        setShowPatternMenu(false);
      } else {
        alert('Failed to delete all patterns');
      }
    } catch (e) {
      console.error('Delete all failed:', e);
      alert('Failed to delete all patterns (API error)');
    }
  };

  // 選択中のパターン（AUTO_DEMO_IDまたは通常のパターンID）
  const [selectedPatternId, setSelectedPatternId] = useState<string>(AUTO_DEMO_ID);

  // ビジュアライザー選択
  const [selectedVisualizer, setSelectedVisualizer] = useState<VisualizerType>('particle');

  // パターンドロップダウン
  const [showPatternMenu, setShowPatternMenu] = useState(false);

  // キャプション表示
  const [showCaptions, setShowCaptions] = useState(true);

  // ミュート状態（デフォルトでミュート）
  const [isMuted, setIsMuted] = useState(true);

  // ミュート状態をplaybackに反映
  useEffect(() => {
    playback.setMuted(isMuted);
  }, [isMuted, playback]);

  // 利用可能なビジュアライザー
  const availableVisualizers = VISUALIZERS.filter(v => v.available);
  const currentVisualizer = VISUALIZERS.find(v => v.id === selectedVisualizer);

  // ビジュアライザーを選択
  const selectVisualizer = useCallback((id: VisualizerType) => {
    setSelectedVisualizer(id);
  }, []);

  // 現在のビジュアライザーのインデックスを取得
  const currentVisualizerIndex = availableVisualizers.findIndex(v => v.id === selectedVisualizer);

  // 左右キーでビジュアライザーを切り替え
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newIndex = currentVisualizerIndex > 0
          ? currentVisualizerIndex - 1
          : availableVisualizers.length - 1;
        setSelectedVisualizer(availableVisualizers[newIndex].id);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const newIndex = currentVisualizerIndex < availableVisualizers.length - 1
          ? currentVisualizerIndex + 1
          : 0;
        setSelectedVisualizer(availableVisualizers[newIndex].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentVisualizerIndex, availableVisualizers]);

  // タッチスワイプ処理
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const diffX = touchStartX.current - touchEndX;
    const diffY = touchStartY.current - touchEndY;

    // 水平方向の移動が大きく(50px以上)、かつ垂直方向の移動が小さい(100px以下)場合のみスワイプと判定
    if (Math.abs(diffX) > 50 && Math.abs(diffY) < 100) {
      if (diffX > 0) {
        // 左スワイプ（進む）
        const newIndex = currentVisualizerIndex < availableVisualizers.length - 1
          ? currentVisualizerIndex + 1
          : 0;
        setSelectedVisualizer(availableVisualizers[newIndex].id);
      } else {
        // 右スワイプ（戻る）
        const newIndex = currentVisualizerIndex > 0
          ? currentVisualizerIndex - 1
          : availableVisualizers.length - 1;
        setSelectedVisualizer(availableVisualizers[newIndex].id);
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  // メニュー外クリックで閉じる
  useEffect(() => {
    if (!showPatternMenu) return;
    const handleClickOutside = () => {
      setShowPatternMenu(false);
    };
    // 少し遅延させてトグルボタンのクリックと競合しないようにする
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showPatternMenu]);

  // Auto Demoモードかどうか
  const isAutoDemo = selectedPatternId === AUTO_DEMO_ID;

  // パターンを選択してロード
  const selectPattern = useCallback((patternId: string) => {
    setShowPatternMenu(false);
    if (patternId === AUTO_DEMO_ID) {
      // Auto Demoモードに切り替え
      playback.stop();
      setSelectedPatternId(AUTO_DEMO_ID);
    } else {
      // 通常のパターンをロード
      const pattern = patterns.find(p => p.id === patternId);
      if (!pattern) return;

      playback.load(pattern.data);
      setSelectedPatternId(patternId);
    }
  }, [patterns, playback]);

  // 全パターンリスト（Auto含む）
  const allPatternOptions = [
    { id: AUTO_DEMO_ID, name: 'Auto', description: 'Automatic state cycling demo' },
    ...patterns.map(p => ({ id: p.id, name: p.name, description: p.description })),
  ];

  // 現在のパターン名を取得
  const currentPatternName = selectedPatternId === AUTO_DEMO_ID
    ? 'Auto'
    : selectedPatternId === '__custom__'
      ? 'Custom'
      : patterns.find(p => p.id === selectedPatternId)?.name || 'Unknown';

  // 画面サイズに応じてビジュアライザーサイズとレイアウトを調整
  useEffect(() => {
    const updateLayout = () => {
      setDimensions(calculateVisualizerSize());
      setIsWideScreen(window.innerWidth > 768);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  // Autoモード完了時に次のパターンへ移行するためのref
  const patternsRef = useRef(patterns);
  const playbackLoadRef = useRef(playback.load);

  useEffect(() => {
    patternsRef.current = patterns;
    playbackLoadRef.current = playback.load;
  }, [patterns, playback.load]);

  // Auto Demoモードのアニメーション（1周したら次のパターンへ）
  useEffect(() => {
    if (!isAutoDemo) return;

    const states: VisualizerState[] = ['listening', 'thinking', 'speaking', 'muted'];
    const stateCount = states.length;
    const totalStates = stateCount * 1; // 1周分
    let currentIndex = 0;
    let totalProgress = 0;
    let currentStateForAudio = states[0];

    // 状態遷移開始時にプログレスをリセット
    setAutoProgress(0);
    setAutoState(states[0]);

    // 状態を順番に切り替え（3秒ごと）
    const stateInterval = setInterval(() => {
      totalProgress++;
      currentIndex = totalProgress % stateCount;
      currentStateForAudio = states[currentIndex];
      setAutoState(currentStateForAudio);
      setAutoProgress(totalProgress / totalStates);

      // 2周完了（8ステップ後）
      if (totalProgress >= totalStates) {
        clearInterval(stateInterval);
        const currentPatterns = patternsRef.current;
        if (currentPatterns.length > 0) {
          // 次のパターンをロードして再生開始
          const firstPattern = currentPatterns[0];
          playbackLoadRef.current(firstPattern.data);
          setSelectedPatternId(firstPattern.id);
        }
      }
    }, 3000);

    // 音声レベルをランダムに変動（50msごと）
    const audioInterval = setInterval(() => {
      const baseLevel = currentStateForAudio === 'listening' ? 0.3 :
                       currentStateForAudio === 'speaking' ? 0.5 : 0.1;
      setAutoAudioLevel(baseLevel + Math.random() * 0.4);
    }, 50);

    return () => {
      clearInterval(stateInterval);
      clearInterval(audioInterval);
    };
  }, [isAutoDemo]);

  // 次のパターンへの遷移処理中フラグ（重複防止）
  const isTransitioningRef = useRef(false);

  // パターン再生完了時に次のパターンへ（ループ）
  useEffect(() => {
    // 再生完了を検出（status が 'ended' になった）
    if (playback.status === 'ended' && !isAutoDemo && selectedPatternId !== '__custom__' && !isTransitioningRef.current) {
      isTransitioningRef.current = true;
      const currentPatternIndex = patterns.findIndex(p => p.id === selectedPatternId);

      if (currentPatternIndex >= 0) {
        const nextIndex = currentPatternIndex + 1;

        setTimeout(() => {
          if (nextIndex < patterns.length) {
            // 次のパターンへ
            const nextPattern = patterns[nextIndex];
            playback.load(nextPattern.data);
            setSelectedPatternId(nextPattern.id);
            // ロード後に再生開始
            setTimeout(() => {
              playback.play();
              isTransitioningRef.current = false;
            }, 150);
          } else {
            // 全パターン終了 → Auto に戻る
            playback.stop();
            setSelectedPatternId(AUTO_DEMO_ID);
            isTransitioningRef.current = false;
          }
        }, 500);
      } else {
        isTransitioningRef.current = false;
      }
    }
  }, [playback.status, isAutoDemo, selectedPatternId, patterns, playback]);

  // Autoから最初のパターンへ移行時に再生開始
  const prevSelectedPatternIdRef = useRef(selectedPatternId);
  useEffect(() => {
    const prevId = prevSelectedPatternIdRef.current;
    prevSelectedPatternIdRef.current = selectedPatternId;

    // AutoからPatternに切り替わった時
    if (prevId === AUTO_DEMO_ID && selectedPatternId !== AUTO_DEMO_ID && selectedPatternId !== '__custom__') {
      // 少し待ってから再生開始
      const timer = setTimeout(() => {
        playback.play();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [selectedPatternId, playback]);

  // ファイル選択ハンドラー
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await playback.loadFromFile(file);
      setSelectedPatternId('__custom__');
      console.log('[App] Loaded conversation log:', file.name);
    } catch (err) {
      console.error('[App] Failed to load file:', err);
      alert('Failed to load conversation log. Please check the file format.');
    }

    // ファイル入力をリセット（同じファイルを再選択できるように）
    e.target.value = '';
  };

  // 再生/一時停止トグル
  const togglePlayback = () => {
    if (playback.status === 'playing') {
      playback.pause();
    } else {
      playback.play();
    }
  };

  // 現在の表示状態を決定
  const currentState = isAutoDemo
    ? autoState
    : toVisualizerState(playback.state);

  const currentAudioLevel = isMuted
    ? 0
    : (isAutoDemo ? autoAudioLevel : playback.audioLevel);

  const currentZcr = isAutoDemo ? autoAudioLevel * 0.5 : playback.zcr;
  const currentRmsHigh = isAutoDemo ? autoAudioLevel * 0.3 : playback.rmsHigh;

  const particleColor = isDarkMode ? '#FFFFFF' : '#000000';
  const backgroundColor = isDarkMode ? '#000000' : '#FFFFFF';

  return (
    <div className="app" style={{ backgroundColor }}>
      <header className="header">
        <h1 style={{ color: particleColor }}>Agentory</h1>
        <p className="subtitle" style={{ color: particleColor, opacity: 0.7 }}>
          Agent State Visualizer
        </p>
      </header>

      <main 
        className="main" 
        onTouchStart={handleTouchStart} 
        onTouchEnd={handleTouchEnd}
      >
        {/* ビジュアライザー（中央配置）+ コントロール */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {/* ビジュアライザー */}
          <div
            className="visualizer-container"
            style={{
              backgroundColor,
              border: `1px solid ${isDarkMode ? '#333' : '#ddd'}`,
              boxShadow: isDarkMode
                ? '0 4px 30px rgba(255, 255, 255, 0.15)'
                : '0 4px 20px rgba(0, 0, 0, 0.2)',
            }}
          >
          {selectedVisualizer === 'particle' && (
            <ParticleVisualizerWeb
              audioLevel={currentAudioLevel}
              zcr={currentZcr}
              rmsHigh={currentRmsHigh}
              state={currentState}
              transcript={!isAutoDemo ? playback.aiTranscript : undefined}
              userTranscript={!isAutoDemo ? playback.userTranscript : undefined}
              showCaption={showCaptions}
              width={dimensions.width}
              height={dimensions.height}
              particleColor={particleColor}
            />
          )}
          {selectedVisualizer === 'floating' && (
            <FloatingParticlesVisualizer
              audioLevel={currentAudioLevel}
              zcr={currentZcr}
              rmsHigh={currentRmsHigh}
              state={currentState}
              transcript={!isAutoDemo ? playback.aiTranscript : undefined}
              userTranscript={!isAutoDemo ? playback.userTranscript : undefined}
              showCaption={showCaptions}
              width={dimensions.width}
              height={dimensions.height}
              particleColor={particleColor}
              particleCount={500}
              particleSize={1}
              radiusDispersion={0.3}
              debug={false}
            />
          )}
          {selectedVisualizer === 'text' && (
            <StreamingTextVisualizer
              audioLevel={currentAudioLevel}
              state={currentState}
              transcript={!isAutoDemo ? playback.aiTranscript : undefined}
              userTranscript={!isAutoDemo ? playback.userTranscript : undefined}
              showCaption={showCaptions}
              width={dimensions.width}
              height={dimensions.height}
              color={particleColor}
            />
          )}
          {selectedVisualizer === 'waveform' && (
            <div
              style={{
                width: dimensions.width,
                height: dimensions.height,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: particleColor,
                opacity: 0.5,
              }}
            >
              Waveform Visualizer (Coming Soon)
            </div>
          )}
          {selectedVisualizer === 'minimal' && (
            <div
              style={{
                width: dimensions.width,
                height: dimensions.height,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: particleColor,
                opacity: 0.5,
              }}
            >
              Minimal Visualizer (Coming Soon)
            </div>
          )}
          </div>

          {/* ドットインジケーター（ビジュアライザー切り替え用） */}
          <div
            style={{
              position: 'absolute',
              top: `calc(50% + ${dimensions.height / 2}px + 0.5rem)`,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
            }}
          >
            {availableVisualizers.map((vis, index) => (
              <button
                key={vis.id}
                onClick={() => selectVisualizer(vis.id)}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: particleColor,
                  opacity: index === currentVisualizerIndex ? 1 : 0.3,
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'opacity 0.2s',
                }}
                title={vis.name}
              />
            ))}
          </div>

          {/* コントロールパネル（PC:右側下部 / モバイル:下部右寄せ） */}
          <div
            style={{
              position: 'absolute',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
              width: '120px',
              ...(isWideScreen
                ? {
                    // PC: ビジュアライザーの右側、下揃え
                    left: `calc(50% + ${dimensions.width / 2}px + 1rem)`,
                    bottom: `calc(50% - ${dimensions.height / 2}px)`,
                  }
                : {
                    // モバイル: ビジュアライザーの下、左寄せ
                    top: `calc(50% + ${dimensions.height / 2}px + 2rem)`,
                    left: `calc(50% - ${dimensions.width / 2}px)`,
                  }),
            }}
          >
          {/* Visualizerタイトル（スクランブルアニメーション付き） */}
          <div style={{ marginBottom: '0.1rem', fontSize: '0.7rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
            <ScrambleText text={currentVisualizer?.name || 'Visualizer'} color={particleColor} showDots={false} />
          </div>

          {/* State表示（スクランブルアニメーション付き） */}
          <div style={{ marginBottom: '0.2rem', opacity: 0.6, fontSize: '0.5rem' }}>
            <ScrambleText text={currentState} color={particleColor} />
          </div>

          {/* Pattern選択（ドロップダウン） */}
          <div style={{ position: 'relative', marginBottom: '0.2rem' }}>
            <button
              onClick={() => setShowPatternMenu(!showPatternMenu)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
                fontSize: '0.55rem',
                whiteSpace: 'nowrap',
              }}
              title="Click to select pattern"
            >
              <ScrambleText text={currentPatternName} color={particleColor} showDots={false} />
            </button>

            {/* Patternドロップダウンメニュー */}
            {showPatternMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '0.2rem',
                  backgroundColor: isDarkMode ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.95)',
                  borderRadius: '4px',
                  padding: '0.2rem',
                  zIndex: 200,
                  minWidth: '140px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}
              >
                {allPatternOptions.map((pattern) => (
                  <div key={pattern.id} style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <button
                      onClick={() => selectPattern(pattern.id)}
                      style={{
                        flex: 1,
                        background: selectedPatternId === pattern.id ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : 'none',
                        border: 'none',
                        color: particleColor,
                        fontSize: '0.55rem',
                        cursor: 'pointer',
                        padding: '0.25rem 0.4rem',
                        textAlign: 'left',
                        borderRadius: '2px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={pattern.description}
                    >
                      {pattern.name}
                    </button>
                    {pattern.id !== AUTO_DEMO_ID && (
                      <button
                        onClick={(e) => deletePattern(pattern.id, e)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#FF3B30',
                          fontSize: '0.55rem',
                          cursor: 'pointer',
                          padding: '0.25rem 0.4rem',
                          opacity: 0.7,
                        }}
                        title="Delete pattern"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
                
                {/* Clear All Button */}
                {patterns.length > 0 && (
                  <button
                    onClick={deleteAllPatterns}
                    style={{
                      display: 'block',
                      width: '100%',
                      background: 'rgba(255, 59, 48, 0.1)',
                      border: 'none',
                      color: '#FF3B30',
                      fontSize: '0.55rem',
                      cursor: 'pointer',
                      padding: '0.25rem 0.4rem',
                      textAlign: 'center',
                      borderRadius: '2px',
                      marginTop: '0.2rem',
                      marginBottom: '0.2rem',
                    }}
                    title="Delete all patterns"
                  >
                    Clear All
                  </button>
                )}

                {/* カスタムファイル読み込み */}
                <button
                  onClick={() => {
                    setShowPatternMenu(false);
                    fileInputRef.current?.click();
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    background: selectedPatternId === '__custom__' ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : 'none',
                    border: 'none',
                    color: particleColor,
                    fontSize: '0.55rem',
                    cursor: 'pointer',
                    padding: '0.25rem 0.4rem',
                    textAlign: 'left',
                    borderRadius: '2px',
                    opacity: 0.7,
                    marginTop: '0.2rem',
                    borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                  }}
                  title="Load custom JSON file"
                >
                  Custom...
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {/* 進行バー */}
          <div
            style={{
              width: '100%',
              height: '2px',
              backgroundColor: isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(isAutoDemo ? autoProgress : playback.progress) * 100}%`,
                height: '100%',
                backgroundColor: particleColor,
                opacity: 0.6,
              }}
            />
          </div>

          {/* MiniEqualizer（プログレスバーと同じ幅） */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <MiniEqualizer
              level={currentAudioLevel}
              zcr={currentZcr}
              rmsHigh={currentRmsHigh}
              columns={20}
              rows={4}
              color={particleColor}
            />
          </div>

          {/* アイコン行：再生・一時停止・ミュート・字幕・モード切り替え */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.2rem' }}>
            {/* 再生/一時停止 */}
            <button
              onClick={togglePlayback}
              disabled={isAutoDemo || !playback.isLoaded}
              style={{
                background: 'none',
                border: 'none',
                cursor: isAutoDemo || !playback.isLoaded ? 'default' : 'pointer',
                padding: '0.1rem',
                opacity: isAutoDemo || !playback.isLoaded ? 0.3 : 0.7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={playback.status === 'playing' ? 'Pause' : 'Play'}
            >
              {playback.status === 'playing' ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill={particleColor} stroke="none">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill={particleColor} stroke="none">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>

            {/* ミュート */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.1rem',
                opacity: isMuted ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={particleColor} strokeWidth="2">
                  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill={particleColor} />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={particleColor} strokeWidth="2">
                  <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill={particleColor} />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>

            {/* 字幕 */}
            <button
              onClick={() => setShowCaptions(!showCaptions)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.1rem',
                opacity: showCaptions ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={showCaptions ? 'Hide subtitles' : 'Show subtitles'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={particleColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="13" y2="12" />
              </svg>
            </button>

            {/* テーマ切り替え（システム/ライト/ダーク循環） */}
            <button
              onClick={() => {
                const modes: ThemeMode[] = ['system', 'light', 'dark'];
                const currentIndex = modes.indexOf(themeMode);
                const nextIndex = (currentIndex + 1) % modes.length;
                setThemeMode(modes[nextIndex]);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.1rem',
                opacity: 0.7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={`Theme: ${themeMode}`}
            >
              {themeMode === 'system' ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={particleColor} strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3v18" />
                  <path d="M12 3a9 9 0 0 1 0 18" fill={particleColor} />
                </svg>
              ) : themeMode === 'light' ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={particleColor} strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={particleColor} strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p style={{ color: particleColor, opacity: 0.5 }}>
          &copy; 2025 Agentory Project
        </p>
      </footer>
    </div>
  );
}

export default App;
