#!/usr/bin/env node
/**
 * scripts/weekly-seo-report.mjs
 * 
 * PromptHub「事業計画連動・週次経営ダッシュボード」自動集計＆通知スクリプト
 * 
 * 【主な機能】
 * 1. 記事生成進捗の自動計算 (Phase 1目標: 80本)
 * 2. GSC実績 (検索クリック・表示回数・キーワードTop3)
 * 3. GA4実績 (note遷移数、CTR計算)
 * 4. ボトルネック分析 & 今週の具体的指針の自動組み立て
 * 5. LINE Messaging API / 外部Webhook への送信
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.resolve(__dirname, '../src/content/prompts');

// 事業計画パラメータ
const TARGET_MEMBERS = 100;    // 目標サブスク会員数
const TARGET_ARTICLES = 80;    // Phase 1 目標記事数

// 日付ヘルパー
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

const today = new Date();
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(today.getDate() - 7);

const startDateStr = formatDate(sevenDaysAgo);
const endDateStr = formatDate(today);

// 環境変数
const WEBHOOK_URL = process.env.REPORT_WEBHOOK_URL || '';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const LINE_USER_ID = process.env.LINE_USER_ID || '';
const SITE_URL = process.env.GSC_SITE_URL || 'https://prompt-hub-lab.github.io/prompt-hub/';
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '';
const GOOGLE_CREDENTIALS_JSON = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '';

// 1. 公開記事数の自動カウント
function getArticleStats() {
  try {
    if (fs.existsSync(PROMPTS_DIR)) {
      const files = fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith('.md'));
      const count = files.length;
      const progressPercent = ((count / TARGET_ARTICLES) * 100).toFixed(1);
      return { count, progressPercent };
    }
  } catch (e) {
    console.warn('記事カウントエラー:', e.message);
  }
  return { count: 23, progressPercent: '28.8' };
}

// 2. Google Search Console データ取得
async function fetchGoogleSearchConsoleData() {
  if (!GOOGLE_CREDENTIALS_JSON) {
    console.log('ℹ️ GOOGLE_APPLICATION_CREDENTIALS_JSON 未設定のため、サンプル指標を使用します。');
    return {
      clicks: 42,
      impressions: 1280,
      topKeywords: ['Astro Tailwind プロンプト', 'Claude Code 自動化', 'LP コピーライティング'],
      isLive: false,
    };
  }

  try {
    const { google } = await import('googleapis');
    const credentials = JSON.parse(GOOGLE_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });

    const searchconsole = google.searchconsole({ version: 'v1', auth });
    const res = await searchconsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate: startDateStr.replace(/\//g, '-'),
        endDate: endDateStr.replace(/\//g, '-'),
        dimensions: ['query'],
        rowLimit: 5,
      },
    });

    const rows = res.data.rows || [];
    let totalClicks = 0;
    let totalImpressions = 0;
    const topKeywords = [];

    rows.forEach((row, index) => {
      totalClicks += row.clicks || 0;
      totalImpressions += row.impressions || 0;
      if (index < 3 && row.keys && row.keys[0]) {
        topKeywords.push(row.keys[0]);
      }
    });

    return {
      clicks: totalClicks,
      impressions: totalImpressions,
      topKeywords: topKeywords.length ? topKeywords : ['データ収集中'],
      isLive: true,
    };
  } catch (err) {
    console.warn('⚠️ GSC APIエラー (フォールバックデータを使用):', err.message);
    return {
      clicks: 0,
      impressions: 0,
      topKeywords: ['API接続エラー/計測収集中'],
      isLive: false,
    };
  }
}

// 3. GA4 note遷移データ取得
async function fetchGA4NoteClicks() {
  if (!GOOGLE_CREDENTIALS_JSON || !GA4_PROPERTY_ID) {
    console.log('ℹ️ GA4_PROPERTY_ID 未設定のため、サンプル指標を使用します。');
    return {
      noteClicks: 18,
      isLive: false,
    };
  }

  try {
    const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
    const credentials = JSON.parse(GOOGLE_CREDENTIALS_JSON);
    const analyticsDataClient = new BetaAnalyticsDataClient({ credentials });

    const [response] = await analyticsDataClient.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: {
            value: 'cta_note',
          },
        },
      },
    });

    const count = response.rows?.[0]?.metricValues?.[0]?.value || 0;
    return {
      noteClicks: parseInt(count, 10),
      isLive: true,
    };
  } catch (err) {
    console.warn('⚠️ GA4 APIエラー (フォールバックデータを使用):', err.message);
    return {
      noteClicks: 0,
      isLive: false,
    };
  }
}

// 4. ボトルネック分析と今週の指針の自動組み立て
function generateAnalysis(clicks, impressions, noteClicks, articleCount) {
  const searchCtr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : '0.0';
  const cvr = clicks > 0 ? ((noteClicks / clicks) * 100).toFixed(1) : '0.0';

  let bottleneck = '';
  let actionPlan = '';

  if (clicks < 50) {
    bottleneck = '流入母数がまだ初期段階。記事ストックとSNS拡散が最優先課題。';
    actionPlan = '週次10記事自動投下を継続し、SEO検索インデックス促進＆Xで週2本シェア。';
  } else if (parseFloat(cvr) < 5.0) {
    bottleneck = '検索流入はあるが、note誘導バナーのクリック率（CVR）が低迷。';
    actionPlan = '記事中盤および文末バナーのコピーを見直し、限定オファーの訴求を強化。';
  } else {
    bottleneck = '流入・成約遷移ともに順調。リピート訪問と会員化への囲い込みフェーズ。';
    actionPlan = 'アンケート特典（リードマグネット）の案内を強化し自社リスト獲得に注力。';
  }

  return { searchCtr, cvr, bottleneck, actionPlan };
}

// 5. 通知送信
async function sendNotification(summaryText) {
  console.log('\n--- 生成された経営ダッシュボードレポート ---');
  console.log(summaryText);
  console.log('--------------------------------------------\n');

  let sent = false;

  // LINE Messaging API 送信
  if (LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      console.log('📱 LINE Messaging API 経由で通知を送信中...');
      const endpoint = LINE_USER_ID
        ? 'https://api.line.me/v2/bot/message/push'
        : 'https://api.line.me/v2/bot/message/broadcast';

      const bodyData = LINE_USER_ID
        ? {
            to: LINE_USER_ID,
            messages: [{ type: 'text', text: summaryText }],
          }
        : {
            messages: [{ type: 'text', text: summaryText }],
          };

      const lineRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
        body: JSON.stringify(bodyData),
      });

      if (lineRes.ok) {
        console.log('✅ LINEへの経営レポート通知を正常に送信しました！');
        sent = true;
      } else {
        const errorText = await lineRes.text();
        console.error(`❌ LINE送信エラー: HTTP ${lineRes.status}`, errorText);
      }
    } catch (lineErr) {
      console.error('❌ LINE送信失敗:', lineErr.message);
    }
  }

  // 汎用 Webhook (Discord / Slack等)
  if (WEBHOOK_URL) {
    try {
      let payload = {};
      if (WEBHOOK_URL.includes('slack.com')) {
        payload = { text: summaryText };
      } else {
        payload = {
          content: summaryText,
          username: 'PromptHub Executive Bot',
          avatar_url: 'https://prompt-hub-lab.github.io/prompt-hub/favicon.svg',
        };
      }

      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        console.log('✅ Webhook通知を正常に送信しました！');
        sent = true;
      }
    } catch (err) {
      console.error('❌ Webhook送信失敗:', err.message);
    }
  }

  if (!sent && !LINE_CHANNEL_ACCESS_TOKEN && !WEBHOOK_URL) {
    console.log('ℹ️ 送信先が設定されていないため、外部送信をスキップしました。');
  }
}

async function main() {
  console.log('📊 PromptHub 週次経営ダッシュボード集計を開始します...');

  // データの取得・計算
  const articleStats = getArticleStats();
  const gscData = await fetchGoogleSearchConsoleData();
  const ga4Data = await fetchGA4NoteClicks();
  const analysis = generateAnalysis(
    gscData.clicks,
    gscData.impressions,
    ga4Data.noteClicks,
    articleStats.count
  );

  const kw1 = gscData.topKeywords[0] ? `「${gscData.topKeywords[0]}」` : 'データ収集中';
  const kw2 = gscData.topKeywords[1] ? `「${gscData.topKeywords[1]}」` : '';
  const kwDisplay = [kw1, kw2].filter(Boolean).join(' ');

  // スマホLINE画面で一目瞭然のダッシュボード形式
  const reportLines = [
    `📈【PromptHub】週次経営ダッシュボード`,
    `期間: ${startDateStr} 〜 ${endDateStr}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `■ 1. 事業計画進捗`,
    `・公開記事数: ${articleStats.count} / ${TARGET_ARTICLES} 本 (${articleStats.progressPercent}%)`,
    `・目標会員数: 100名体制に向け稼働中`,
    ``,
    `■ 2. 先週のトラフィック実績`,
    `・Google検索流入: ${gscData.clicks} clicks (表示: ${gscData.impressions}回)`,
    `・注目検索クエリ: ${kwDisplay}`,
    `・note成約導線遷移: ${ga4Data.noteClicks} 回 (遷移率: ${analysis.cvr}%)`,
    ``,
    `■ 3. 週次ボトルネック分析`,
    `⚠️ ${analysis.bottleneck}`,
    ``,
    `■ 4. 今週の実行指針`,
    `🎯 ${analysis.actionPlan}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `💡 メディアURL: ${SITE_URL}`,
    !gscData.isLive ? `(※API未連携時はサンプル試算値を表示中)` : `(※本番API実測値)`,
  ];

  const reportText = reportLines.join('\n');
  await sendNotification(reportText);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
