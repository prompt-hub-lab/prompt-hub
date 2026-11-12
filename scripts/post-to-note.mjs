import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const NOTE_EMAIL = process.env.NOTE_EMAIL || 'ryu1.kan.02@gmail.com';
const NOTE_PASSWORD = process.env.NOTE_PASSWORD || 'kerokero9652';

export async function createNoteArticle({
  title,
  bodyMarkdown,
  isDraft = true,
  price = 1980
}) {
  console.log(`[note-poster] Starting browser for note article: "${title}" (Draft: ${isDraft})`);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  try {
    // 1. Login
    console.log('[note-poster] Logging in to note.com...');
    await page.goto('https://note.com/login', { waitUntil: 'networkidle' });

    await page.locator('input#email, input[type="email"], input[name="login"]').first().fill(NOTE_EMAIL);
    await page.locator('input#password, input[type="password"], input[name="password"]').first().fill(NOTE_PASSWORD);

    await Promise.all([
      page.waitForNavigation({ timeout: 20000 }).catch(() => {}),
      page.locator('button[type="submit"], button:has-text("ログイン")').first().click()
    ]);

    await page.waitForTimeout(3000);
    console.log('[note-poster] Login successful. Navigating to editor...');

    // 2. Open Editor
    await page.goto('https://editor.note.com/notes/new', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    console.log('[note-poster] Editor URL:', page.url());

    // 3. Set Title
    console.log('[note-poster] Setting title...');
    const titleLocator = page.locator('textarea[placeholder*="記事タイトル"], textarea[placeholder*="タイトル"], textarea.o-noteEditor__title').first();
    await titleLocator.waitFor({ state: 'visible', timeout: 10000 });
    await titleLocator.click();
    await titleLocator.fill(title);

    // 4. Set Body
    console.log('[note-poster] Setting body content...');
    const bodyLocator = page.locator('div[contenteditable="true"], .ProseMirror, .o-noteEditor__body').first();
    await bodyLocator.waitFor({ state: 'visible', timeout: 10000 });
    await bodyLocator.click();

    // Use clipboard paste or insertText for rich text editor
    await page.evaluate((text) => {
      const editor = document.querySelector('div[contenteditable="true"], .ProseMirror');
      if (editor) {
        editor.focus();
        document.execCommand('insertText', false, text);
      }
    }, bodyMarkdown);

    await page.waitForTimeout(3000);

    // 5. Check save draft
    console.log('[note-poster] Checking draft status...');
    const draftStatusBtn = page.locator('button:has-text("下書き保存"), button:has-text("下書き")');
    if (await draftStatusBtn.count() > 0) {
      await draftStatusBtn.first().click().catch(() => {});
      console.log('[note-poster] Clicked "下書き保存"');
    }

    await page.waitForTimeout(3000);
    const finalUrl = page.url();
    console.log(`[note-poster] ✅ Successfully created note article: ${finalUrl}`);

    return {
      success: true,
      url: finalUrl,
      title
    };

  } catch (error) {
    console.error('[note-poster] ❌ Failed to create note article:', error);
    // Take screenshot on failure
    const screenshotPath = '/tmp/note_error.png';
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    console.log(`[note-poster] Saved debug screenshot to ${screenshotPath}`);
    throw error;
  } finally {
    await browser.close();
  }
}

// CLI Execution if run directly
if (process.argv[1].endsWith('post-to-note.mjs')) {
  const testTitle = '【実務直結】コピペで即日業務を自動化する「プロンプト＆スクリプト完全版データベース（Notion DB / Claude Code対応）」';
  const testBody = `WEB制作・マーケティング・SNS運用の繰り返し業務をAIでゼロにする実践プロンプトメディア「PromptHub」公式有料noteです。

現場で検証済みの「コピペで動く実戦プロンプト」や「Claude Code / Notion自動化スクリプト」を毎週配信中。

━━━━━━━━━━━━━━━━━━━━
■ 配布Notionデータベースの全貌
━━━━━━━━━━━━━━━━━━━━
・ワンクリックで自分のNotionへ複製（Duplicate）可能
・5大ジャンル別（SEO・SNS・LP・Claude Code・ディレクション）フィルタリング
・公開URL: https://dawn-texture-9d3.notion.site/PromptHub-416566ce1972801a859acc9b62bb183e?source=copy_link

━━━━━━━━━━━━━━━━━━━━
■ Claude Code / Cursor 自動化設定ファイル
━━━━━━━━━━━━━━━━━━━━
・そのまま置くだけで動く .cursorrules / CLAUDE.md 定義ファイル
・ターミナルからワンライナーでSEO記事構成案やコミット文を吐かせるシェルスクリプト
・スターターキットZIP: https://prompt-hub-lab.github.io/prompt-hub/prompthub-starter-kit.zip

━━━━━━━━━━━━━━━━━━━━
■ メンバーシップについて
━━━━━━━━━━━━━━━━━━━━
PromptHub メンバーシップ（月額980円 / 初月無料）にご参加いただくと、毎週月曜日に自動生成される最新の実務プロンプトがNotionデータベースへ永続的に自動同期されます！
`;

  createNoteArticle({
    title: testTitle,
    bodyMarkdown: testBody,
    isDraft: true
  }).then(res => {
    console.log('Result:', JSON.stringify(res, null, 2));
    process.exit(0);
  }).catch(err => {
    console.error('Execution failed:', err);
    process.exit(1);
  });
}
