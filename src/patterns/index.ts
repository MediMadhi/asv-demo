// パターン自動ローダー
// patternsフォルダ内のJSONファイルを自動検出

import type { ConversationLog } from '../playback/types';

// パターンメタデータ（name, descriptionを追加した拡張版）
export interface ExtendedMeta {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  duration?: number;
  name?: string;
  description?: string;
}

// JSONファイルから読み込まれる生データ
interface RawPatternData {
  meta: ExtendedMeta;
  entries: unknown[];
}

export interface PatternInfo {
  id: string;
  name: string;
  description: string;
  duration: number;
  filename: string;
  data: ConversationLog;
}

// Viteのimport.meta.globでpatternsフォルダのJSONを自動インポート
// eager: trueでビルド時に全て読み込む
const patternModules = import.meta.glob<RawPatternData>(
  '/public/patterns/*.json',
  { eager: true, import: 'default' }
);

// パターン一覧を生成
export const loadPatterns = (): PatternInfo[] => {
  const patterns: PatternInfo[] = [];

  for (const [path, rawData] of Object.entries(patternModules)) {
    // パスからファイル名を抽出 (例: /public/patterns/greeting.json -> greeting.json)
    const filename = path.split('/').pop() || '';

    // index.jsonはスキップ（後方互換性のため残っている場合）
    if (filename === 'index.json') continue;

    // metaがない場合はスキップ
    if (!rawData?.meta) {
      console.warn(`Pattern ${filename} has no meta field, skipping`);
      continue;
    }

    const meta = rawData.meta;

    // ConversationLog型に変換
    const data: ConversationLog = {
      meta: {
        sessionId: meta.sessionId || filename.replace('.json', ''),
        startedAt: meta.startedAt || new Date().toISOString(),
        endedAt: meta.endedAt,
        duration: meta.duration,
      },
      entries: rawData.entries as ConversationLog['entries'],
    };

    patterns.push({
      id: meta.sessionId || filename.replace('.json', ''),
      name: meta.name || filename.replace('.json', ''),
      description: meta.description || '',
      duration: meta.duration || 0,
      filename,
      data,
    });
  }

  // 名前でソート
  patterns.sort((a, b) => a.name.localeCompare(b.name));

  return patterns;
};

// シングルトンとしてパターン一覧をエクスポート
export const patterns = loadPatterns();
