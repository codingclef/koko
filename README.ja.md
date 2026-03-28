# 🏠 Koko — ファミリーハブ

[한국어](README.ko.md) | **[日本語]** | [English](README.md)

カレンダー、買い物リスト、メモをひとつにまとめた、家族のリアルタイム共有アプリです。
iOS・Android・Webのどのデバイスからでもアクセスでき、変更はすべての家族に即座に反映されます。

---

## 機能

| 機能 | 説明 |
|------|------|
| カレンダー | 家族の予定を登録・管理、プッシュ通知でリマインダー設定 |
| 買い物リスト | 商品を追加、リアルタイムでチェック、完了済みアイテムに取り消し線 |
| メモ | 家族共有メモ、全デバイスに即座に反映 |
| 予定投票 | 予定確定前に家族の参加可否を投票で確認 |
| リアルタイム同期 | すべての変更が全デバイスに即時反映 |
| PWA対応 | iPhone・Androidのホーム画面に追加してネイティブアプリのように使用可能 |

---

## 動作の仕組み

```
家族メンバーの操作
(予定追加 · 買い物チェック · メモ記入 · 投票)
    │
    ▼
Supabase Realtime
    PostgreSQL の変更を検知
    → WebSocket で接続中の全デバイスに即時ブロードキャスト
    │
    ▼
全デバイス更新
    カレンダー / 買い物リスト / メモが即時反映
    │
    ▼
プッシュ通知（該当する場合）
    PWA Web Push → iOS・Android
```

---

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フロントエンド | Next.js 16 (TypeScript, Tailwind CSS, App Router) |
| バックエンド / DB | Supabase (PostgreSQL, Realtime, Auth) |
| プッシュ通知 | PWA Web Push (iOS 16.4+, Android) |
| CI/CD | GitHub Actions |
| ホスティング | Vercel |

---

## プロジェクト構成

```
koko/
├── src/
│   ├── app/                # Next.js App Router ページ
│   ├── components/         # 共通UIコンポーネント
│   ├── lib/                # Supabase クライアント・ユーティリティ
│   └── types/              # TypeScript 型定義
├── public/                 # 静的ファイル、PWA マニフェスト
├── .github/workflows/      # GitHub Actions CI
└── CLAUDE.md               # AI コーディングエージェント指示
```

---

## はじめに

```bash
npm install
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてください。

### 環境変数

プロジェクトルートに `.env.local` ファイルを作成してください:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 開発ルール

- すべての作業は `feature/*` ブランチ → PR → main マージ
- main ブランチへの直接 push 禁止
- コード作成・修正時は必ずユニットテストも作成
- GitHub Actions CI 通過後にマージ
