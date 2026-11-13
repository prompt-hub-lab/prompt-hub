import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QUEUE_FILE = path.resolve(__dirname, '../data/x-posts-queue.json');

// X API v2 Credentials from env
const X_API_KEY = process.env.X_API_KEY;
const X_API_SECRET = process.env.X_API_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

/**
 * 予約投稿キューから未投稿のポストを1件取得し、Xへ自動投稿する
 */
export async function postNextTweet() {
  if (!fs.existsSync(QUEUE_FILE)) {
    console.log('[x-poster] No queue file found at:', QUEUE_FILE);
    return;
  }

  const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
  let queue = JSON.parse(raw);

  const pendingIndex = queue.findIndex(item => item.status === 'pending');
  if (pendingIndex === -1) {
    console.log('[x-poster] All queued posts have been published!');
    return;
  }

  const targetPost = queue[pendingIndex];
  console.log(`[x-poster] Publishing post #${targetPost.id}: "${targetPost.text.slice(0, 30)}..."`);

  // If X API keys are present, post directly via Twitter API v2
  if (X_API_KEY && X_ACCESS_TOKEN) {
    try {
      // Dynamic import of twitter-api-v2 if configured
      const { TwitterApi } = await import('twitter-api-v2');
      const client = new TwitterApi({
        appKey: X_API_KEY,
        appSecret: X_API_SECRET,
        accessToken: X_ACCESS_TOKEN,
        accessSecret: X_ACCESS_TOKEN_SECRET,
      });

      const res = await client.v2.tweet(targetPost.text);
      console.log(`[x-poster] ✅ Successfully posted to X! Tweet ID: ${res.data.id}`);
      queue[pendingIndex].status = 'published';
      queue[pendingIndex].publishedAt = new Date().toISOString();
      queue[pendingIndex].tweetId = res.data.id;
    } catch (err) {
      console.error('[x-poster] ❌ Failed to post via API:', err);
      throw err;
    }
  } else {
    // Dry-run mode for simulation / pipeline verification
    console.log('[x-poster] ℹ️ X API credentials not detected. Simulating post execution (Dry-run).');
    queue[pendingIndex].status = 'simulated';
    queue[pendingIndex].simulatedAt = new Date().toISOString();
  }

  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
  console.log('[x-poster] Queue updated successfully.');
}

if (process.argv[1].endsWith('post-to-x.mjs')) {
  postNextTweet().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
