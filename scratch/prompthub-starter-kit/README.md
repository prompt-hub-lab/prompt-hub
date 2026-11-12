# PromptHub AI実務自動化スターターキット導入マニュアル

この度は「PromptHub 完全版プロンプト＆スクリプトキット」をご利用いただき誠にありがとうございます！
本キットには、現場の第一線で使われている「Claude Code」および「Cursor」の自動化設定ファイルが同梱されています。

---

## 📦 同梱ファイル一覧

1. **`CLAUDE.md`**:
   - ターミナルで動作する自律AIエージェント「Claude Code」用の振る舞い指示ファイル。
   - プロジェクトルートに配置するだけで、コミットルールやTypeScript厳格モードをAIが自動遵守します。
2. **`.cursorrules`**:
   - AIエディタ「Cursor」向けのプロジェクト最適化ルール定義。
   - レスポンシブTailwind CSSの記法や安全なエラーハンドリングをAIに強制します。
3. **`ai-automation-aliases.sh`**:
   - 毎日のGitコミットや議事録作成をワンライナー（`gca`, `ai-memo` 等）で実行できるシェルエイリアス集。
4. **`README.md`**:
   - 本マニュアル。

---

## 🚀 最短3ステップ導入手順

### ステップ1: プロジェクトへの配置
あなたが現在開発・制作しているプロジェクトのルートディレクトリに、同梱の `CLAUDE.md` と `.cursorrules` をそのままコピー＆ペーストしてください。
```bash
# プロジェクトルートに置くだけで自動認識されます
your-project/
  ├── CLAUDE.md       # Claude Codeが自動読み込み
  ├── .cursorrules    # Cursorが自動読み込み
  ├── package.json
  └── src/
```

### ステップ2: シェルエイリアスの有効化（任意・推奨）
ターミナルで日常的に自動化コマンドを使いたい場合は、`~/.zshrc`（Mac標準）の末尾に `ai-automation-aliases.sh` の内容を貼り付けてください：
```bash
# 設定を反映
source ~/.zshrc
```
これで、ターミナルで `gca` と打つだけで、変更差分からConventional CommitsメッセージをAIが自動作成してコミットしてくれます！

---

## 🎁 購入者限定：最新プロンプトの無料アップデート
PromptHubでは毎週月曜日に最新モデル対応のプロンプトが自動追加されます。
配布Notionデータベースに複製済みの場合、最新の知見が随時蓄積されていきますので、ぜひブックマークしてご活用ください。

- **PromptHub 公式サイト**: https://prompt-hub-lab.github.io/prompt-hub/
- **公式note**: https://note.com/prompt_hub_official
