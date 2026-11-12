import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.resolve(__dirname, '../src/content/prompts');
const DIST_DIR = path.resolve(__dirname, '../dist/note-drafts');

/**
 * 毎週自動生成されるプロンプトから、note用・メンバーシップ限定配布用の
 * 完全版記事原稿（Markdown / テキスト）を自動構築するスクリプト
 */
export async function buildNoteArticles() {
  console.log('[note-builder] Generating note publication articles from latest prompts...');

  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const promptFiles = fs.readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.md'));
  
  // 1. メンバーシップ向け「今週の新着プロンプトまとめ記事」の生成
  const weeklyArticleTitle = `【今週の更新】実務特化AIプロンプト最新10選＆自動化スターターキット（Notion完全同期版）`;
  
  let weeklyContent = `# ${weeklyArticleTitle}

PromptHub メンバーシップ会員の皆様へ。
今週も現場で検証済みの実務特化型AIプロンプト10本をNotionマスターデータベースへ自動追加いたしました！

ワンクリックで最新データを自分のNotionへ取り込み可能です。
また、Claude Code / Cursorの自動化設定ファイル（CLAUDE.md / .cursorrules）も最新仕様へアップデートされています。

━━━━━━━━━━━━━━━━━━━━
■ 今週追加された実務プロンプト一覧
━━━━━━━━━━━━━━━━━━━━
`;

  promptFiles.slice(0, 10).forEach((file, idx) => {
    const raw = fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf8');
    const titleMatch = raw.match(/title:\s*["']?(.*?)["']?$/m);
    const catMatch = raw.match(/category:\s*["']?(.*?)["']?$/m);
    const descMatch = raw.match(/description:\s*["']?(.*?)["']?$/m);

    const title = titleMatch ? titleMatch[1] : file;
    const cat = catMatch ? catMatch[1] : '実務効率化';
    const desc = descMatch ? descMatch[1] : '';

    weeklyContent += `\n### ${idx + 1}. 【${cat}】${title}\n${desc}\n`;
  });

  weeklyContent += `
━━━━━━━━━━━━━━━━━━━━
■ 会員限定・NotionマスターDB複製リンク
━━━━━━━━━━━━━━━━━━━━
https://dawn-texture-9d3.notion.site/PromptHub-416566ce1972801a859acc9b62bb183e?source=copy_link

━━━━━━━━━━━━━━━━━━━━
■ Claude Code / Cursor スターターキットZIP
━━━━━━━━━━━━━━━━━━━━
https://prompt-hub-lab.github.io/prompt-hub/prompthub-starter-kit.zip
`;

  const weeklyOutPath = path.join(DIST_DIR, 'weekly-membership-article.md');
  fs.writeFileSync(weeklyOutPath, weeklyContent, 'utf8');
  console.log(`[note-builder] Generated weekly article at: ${weeklyOutPath}`);

  // 2. 有料単体note（キラーオファー版）の生成
  const paidNoteTitle = `【実務直結】コピペで即日業務を自動化する「プロンプト＆スクリプト完全版データベース（Notion DB / Claude Code対応）」`;
  const paidNoteOutPath = path.join(DIST_DIR, 'paid-note-main.md');
  
  const paidNoteContent = `# ${paidNoteTitle}

WEB制作・マーケティング・SNS運用の繰り返し業務をAIでゼロにする実践プロンプトメディア「PromptHub」公式noteです。

現場で検証済みの「コピペで動く実戦プロンプト」や「Claude Code / Notion自動化スクリプト」を毎週配信中。

---

## 1. 配布Notionデータベースの全貌
・ワンクリックで自分のNotionへ複製（Duplicate）可能
・5大ジャンル別（SEO・SNS・LP・Claude Code・ディレクション）フィルタリング
・公開URL: https://dawn-texture-9d3.notion.site/PromptHub-416566ce1972801a859acc9b62bb183e?source=copy_link

## 2. Claude Code / Cursor 自動化設定ファイル
・そのまま置くだけで動く .cursorrules / CLAUDE.md 定義ファイル
・ターミナルからワンライナーでSEO記事構成案やコミット文を吐かせるシェルスクリプト
・スターターキットZIP: https://prompt-hub-lab.github.io/prompt-hub/prompthub-starter-kit.zip

## 3. メンバーシップについて
PromptHub メンバーシップ（月額980円 / 初月無料）にご参加いただくと、毎週月曜日に自動生成される最新の実務プロンプトがNotionデータベースへ永続的に自動同期されます！
`;

  fs.writeFileSync(paidNoteOutPath, paidNoteContent, 'utf8');
  console.log(`[note-builder] Generated main paid note at: ${paidNoteOutPath}`);

  return {
    weeklyOutPath,
    paidNoteOutPath
  };
}

if (process.argv[1].endsWith('build-note-articles.mjs')) {
  buildNoteArticles().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
