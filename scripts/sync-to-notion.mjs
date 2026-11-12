#!/usr/bin/env node
/**
 * scripts/sync-to-notion.mjs
 * 
 * PromptHub の全プロンプト記事 (src/content/prompts/*.md) を読み込み、
 * Notionデータベースへ自動同期（新規インサート / 重複チェック）するスクリプト。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.resolve(__dirname, '../src/content/prompts');

const NOTION_API_KEY = process.env.NOTION_API_KEY || '';
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '';

// Frontmatterパーサー（簡易型）
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content };

  const rawYaml = match[1];
  const body = match[2];
  const data = {};

  const lines = rawYaml.split('\n');
  let currentKey = null;
  let isMultiLine = false;
  let multiLineBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isMultiLine) {
      if (line.startsWith('  ')) {
        multiLineBuffer.push(line.slice(2));
        continue;
      } else {
        data[currentKey] = multiLineBuffer.join('\n');
        isMultiLine = false;
        multiLineBuffer = [];
      }
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      if (value === '|' || value === '>-' || value === '>') {
        currentKey = key;
        isMultiLine = true;
        multiLineBuffer = [];
      } else {
        data[key] = value.replace(/^["'](.*)["']$/, '$1');
      }
    }
  }

  if (isMultiLine && currentKey) {
    data[currentKey] = multiLineBuffer.join('\n');
  }

  return { data, body };
}

// データベースのスキーマを取得
async function getDatabaseSchema() {
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
    },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion API Error: ${err.message} (${err.code})`);
  }

  return await res.json();
}

// 既存レコードのタイトル一覧を取得（重複防止）
async function getExistingTitles() {
  const existing = new Set();
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const body = startCursor ? JSON.stringify({ start_cursor: startCursor }) : JSON.stringify({});
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Failed to query database: ${err.message}`);
    }

    const data = await res.json();
    data.results.forEach((page) => {
      // Find the title property
      for (const prop of Object.values(page.properties)) {
        if (prop.type === 'title' && prop.title?.[0]?.plain_text) {
          existing.add(prop.title[0].plain_text.trim());
        }
      }
    });

    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }

  return existing;
}

// Notionページを作成
async function createNotionPage(schema, item, slug) {
  const propNames = schema.properties;

  // Find exact property names in user's DB (fallback to case-insensitive or common names)
  let titleKey = 'タイトル';
  let categoryKey = 'カテゴリ';
  let modelKey = '推奨モデル';
  let timeSavedKey = '短縮時間';
  let promptKey = 'プロンプト本文';
  let slugKey = 'スラッグ';
  let dateKey = '公開日';

  for (const [name, prop] of Object.entries(propNames)) {
    if (prop.type === 'title') titleKey = name;
    if (name.includes('カテゴリ') || name.toLowerCase().includes('category')) categoryKey = name;
    if (name.includes('モデル') || name.toLowerCase().includes('model')) modelKey = name;
    if (name.includes('時間') || name.toLowerCase().includes('time')) timeSavedKey = name;
    if (name.includes('プロンプト') || name.toLowerCase().includes('prompt')) promptKey = name;
    if (name.includes('スラッグ') || name.toLowerCase().includes('slug')) slugKey = name;
    if (name.includes('日') || name.toLowerCase().includes('date')) dateKey = name;
  }

  const properties = {
    [titleKey]: {
      title: [{ text: { content: item.title || slug } }],
    },
  };

  // Set optional properties if they exist in schema
  if (propNames[categoryKey]) {
    const type = propNames[categoryKey].type;
    if (type === 'select') {
      properties[categoryKey] = { select: { name: item.category || '一般' } };
    } else if (type === 'rich_text') {
      properties[categoryKey] = { rich_text: [{ text: { content: item.category || '' } }] };
    }
  }

  if (propNames[modelKey] && item.targetModel) {
    const type = propNames[modelKey].type;
    if (type === 'select') {
      properties[modelKey] = { select: { name: item.targetModel } };
    } else {
      properties[modelKey] = { rich_text: [{ text: { content: item.targetModel } }] };
    }
  }

  if (propNames[timeSavedKey] && item.timeSaved) {
    properties[timeSavedKey] = { rich_text: [{ text: { content: item.timeSaved } }] };
  }

  if (propNames[slugKey]) {
    properties[slugKey] = { rich_text: [{ text: { content: slug } }] };
  }

  if (propNames[dateKey] && item.pubDate) {
    properties[dateKey] = { date: { start: item.pubDate.split('T')[0] } };
  }

  // Children blocks: Prompt Code Block and Description
  const children = [
    {
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [
          {
            type: 'text',
            text: { content: item.description || 'PromptHub 実務自動化プロンプト' },
          },
        ],
        icon: { emoji: '⚡' },
        color: 'blue_background',
      },
    },
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '📋 実戦プロンプト（コピペ用）' } }],
      },
    },
    {
      object: 'block',
      type: 'code',
      code: {
        rich_text: [
          {
            type: 'text',
            // Notion block rich_text limit is 2000 chars per text object
            text: { content: (item.promptText || '').slice(0, 2000) },
          },
        ],
        language: 'markdown',
      },
    },
  ];

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DATABASE_ID },
      properties,
      children,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to create page: ${err.message}`);
  }

  return await res.json();
}

async function main() {
  console.log('🚀 Notionへのプロンプト自動同期を開始します...');

  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    console.error('❌ NOTION_API_KEY または NOTION_DATABASE_ID が設定されていません。');
    process.exit(1);
  }

  // 1. スキーマ確認
  let schema;
  try {
    schema = await getDatabaseSchema();
    console.log(`✅ Notionデータベース接続成功: "${schema.title?.[0]?.plain_text || 'PromptHub DB'}"`);
  } catch (err) {
    console.error('\n❌ Notionデータベースの接続に失敗しました:');
    console.error(err.message);
    console.error('\n💡 【重要】Notionページ側でインテグレーションの接続（コネクト）が必要です：');
    console.error('1. 対象のNotionデータベースページを開く');
    console.error('2. 右上の「…（メニュー）」→「コネクト（接続）」をクリック');
    console.error('3. 作成したインテグレーション「PromptHub Auto Sync」を追加してください。\n');
    process.exit(1);
  }

  // 2. 既存タイトルの取得
  const existingTitles = await getExistingTitles();
  console.log(`ℹ️ 既存のNotion登録件数: ${existingTitles.size} 件`);

  // 3. ローカルMarkdownファイルを走査して同期
  const files = fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith('.md'));
  let insertedCount = 0;

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf-8');
    const { data } = parseFrontmatter(content);

    const title = (data.title || slug).trim();
    if (existingTitles.has(title)) {
      // 既に登録済みのためスキップ
      continue;
    }

    try {
      await createNotionPage(schema, data, slug);
      console.log(`✅ [新規同期] ${title}`);
      existingTitles.add(title);
      insertedCount++;
      // Notion APIレートリミット対策 (3 requests / sec)
      await new Promise((r) => setTimeout(r, 400));
    } catch (createErr) {
      console.error(`⚠️ 同期失敗 (${slug}):`, createErr.message);
    }
  }

  console.log(`\n🎉 Notion同期完了！ 新規追加: ${insertedCount} 件 (合計: ${existingTitles.size} 件)`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
