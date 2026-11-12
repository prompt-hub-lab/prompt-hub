/**
 * ==============================================================================
 * PromptHub LINE → Chatwork 自動通知 Google Apps Script (GAS)
 * ==============================================================================
 * 
 * 【機能】
 * 1. LINE公式アカウントで「友だち追加（follow）」が発生した際、
 *    登録者のプロフィール名を取得してChatworkへ通知。
 * 2. LINEで「個別メッセージ（message）」が届いた際、
 *    ユーザー名とメッセージ本文をChatworkへ即時転送。
 */

// 設定定数
const CHATWORK_API_TOKEN = '516c72ca36b5a30d053a449f69b2b4b6';
const CHATWORK_ROOM_ID   = '450930029';
const LINE_ACCESS_TOKEN  = 'A2ugraFL1BbNk0pcKSvDoqPJmwXssCBV6cPL+/YRIuo0Uwkbwrv0YBHoF1usAv0F6d2oODYoQPZr62McL+uZPeep2uutRmhf6NnZpm9/1uV5nCMbEDRCkjJYsCfi7r/AGTmsEmB7zaIaFmtEq0NrNAdB04t89/1O/w1cDnyilFU=';

/**
 * LINE Webhook受信用エンドポイント (doPost)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'no post data' })).setMimeType(ContentService.MimeType.JSON);
    }

    const json = JSON.parse(e.postData.contents);
    const events = json.events;

    if (!events || events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok, no events' })).setMimeType(ContentService.MimeType.JSON);
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventType = event.type;
      const userId = event.source ? event.source.userId : null;

      // ユーザーの表示名を取得
      let displayName = '（名前取得不可）';
      if (userId) {
        displayName = getUserDisplayName(userId);
      }

      // イベントに応じたメッセージ組み立て
      if (eventType === 'follow') {
        // --- 1. 友だち追加イベント ---
        const messageBody = [
          '[info][title]🎉 【LINE公式】新規友だち追加がありました！[/title]',
          '━━━━━━━━━━━━━━━━━━━━',
          `■ ユーザー名: ${displayName}`,
          `■ ユーザーID: ${userId || '不明'}`,
          `■ 登録日時: ${formatCurrentDateTime()}`,
          '━━━━━━━━━━━━━━━━━━━━',
          '新規見込み顧客がリストインしました！[/info]'
        ].join('\n');

        sendToChatwork(messageBody);

      } else if (eventType === 'message' && event.message && event.message.type === 'text') {
        // --- 2. テキストメッセージ受信イベント ---
        const userText = event.message.text;

        const messageBody = [
          '[info][title]📩 【LINE公式】個別メッセージを受信しました[/title]',
          '━━━━━━━━━━━━━━━━━━━━',
          `■ 送信者: ${displayName}`,
          `■ 受信日時: ${formatCurrentDateTime()}`,
          '■ メッセージ内容:',
          userText,
          '━━━━━━━━━━━━━━━━━━━━',
          '※返信はLINE Official Account ManagerまたはLINEアプリから行ってください。[/info]'
        ].join('\n');

        sendToChatwork(messageBody);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error('Webhook Error:', error);
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * LINE User ID から表示名を取得
 */
function getUserDisplayName(userId) {
  try {
    const url = 'https://api.line.me/v2/bot/profile/' + userId;
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN
      },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 200) {
      const profile = JSON.parse(response.getContentText());
      return profile.displayName || '（名前未設定）';
    }
  } catch (e) {
    console.warn('Profile fetch error:', e);
  }
  return '（名前取得エラー）';
}

/**
 * Chatwork APIへメッセージ送信
 */
function sendToChatwork(bodyText) {
  const url = 'https://api.chatwork.com/v2/rooms/' + CHATWORK_ROOM_ID + '/messages';
  const options = {
    method: 'post',
    headers: {
      'X-ChatWorkToken': CHATWORK_API_TOKEN
    },
    payload: {
      body: bodyText
    },
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(url, options);
  console.log('Chatwork Response Code:', res.getResponseCode());
}

/**
 * 日時フォーマット (YYYY/MM/DD HH:mm:ss)
 */
function formatCurrentDateTime() {
  const now = new Date();
  return Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
}
