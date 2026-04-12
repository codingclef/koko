# 🏠 Koko — ファミリーハブ

[한국어](README.ko.md) | **[日本語]** | [English](README.md)

Kokoは、1つの共有アプリシェルを中心に動く家族向けコラボレーションPWAです。
現在のプロダクト範囲は、カレンダー、買い物リスト、家族の招待/参加、ユーザー設定、Web Pushリマインダーです。

## 現在の実装範囲

- メール許可リストで制限されたGoogle OAuthログイン
- 自動の家族作成と招待コードによる家族参加
- 家族全体イベントとカレンダー単位の表示制御を持つカレンダー
- Web Pushによるイベントリマインダー
- リアルタイム同期とドラッグ並び替えに対応した買い物リスト
- テーマ、祝日対象国、旧暦表示のユーザー設定
- モバイルとデスクトップでインストール可能なPWA体験

現在のUIで未実装の項目:

- メモ
- 予定投票

これらはスキーマと生成済み型には存在しますが、現在のフロントエンドの動線には接続されていません。

## ランタイム構成

アプリは1つの家族シェルを常時マウントしたまま利用します。

- `/calendar` が実際のタブアプリの単一エントリールートです
- `/shopping` と `/settings` は `/calendar` へリダイレクトされます
- `TabsShell` が calendar、shopping、settings の各タブを常時マウントし、表示だけを切り替えます
- `src/app/shopping/[id]/page.tsx` だけは例外で独立した詳細ルートとして残っています

この構成により、タブ切り替え時の再読み込みスピナーを減らし、状態も維持できます。

## リアルタイム同期モデル

Kokoは `postgres_changes` ではなく Supabase Realtime Broadcast を使います。

基本パターンは次の通りです。

1. mutationを実行します。
2. 必要なローカル状態を更新します。
3. チャネルが `SUBSCRIBED` になった後で手動の `refresh` broadcast を送ります。

この方式は以下の範囲で使われます。

- 家族単位の買い物リスト更新
- 特定の買い物リスト内アイテム更新
- 月単位のカレンダーイベント更新

## 認証と家族モデル

- ログインはGoogle OAuthのみです。
- OAuthコード交換はSupabaseが自動で処理します。
- コールバックページで、サインイン済みメールを `allowed_emails` に対して検証します。
- 有効な招待コードから来た初回ログインメールは、コールバック検証時に自動許可される場合があります。
- `/api/family` はDB RPCを呼び出して、ユーザーの家族を原子的に取得または作成します。
- `/api/family/join` はDB RPCを呼び出して、招待コードで別の家族に参加させます。

アクティブな家族は、カレンダー、買い物リスト、家族メンバーデータのテナント境界です。

## 技術スタック

| カテゴリ | 技術 |
| --- | --- |
| フロントエンド | Next.js 16, React 19, TypeScript |
| スタイリング | Tailwind CSS v4 |
| バックエンド / DB | Supabase Auth, PostgreSQL, Realtime Broadcast |
| 通知 | Web Push + service worker |
| ホスティング | Vercel |
| テスト | Jest + Testing Library |

## プロジェクト構成

```text
src/
  app/                ルートエントリとAPI route
  components/         UI構成とタブコンテナ
  hooks/              共有クライアントフック
  lib/                Supabase CRUD、APIヘルパー、ユーティリティ
  types/              生成済みDB型と共有アプリ型
  __tests__/          API、lib、hook、component、機能回帰テスト
public/
  manifest.json       PWAマニフェスト
  sw.js               プッシュ通知用サービスワーカー
supabase/
  migrations/         スキーマ、RLS、RPC、運用修正
```

プロジェクトを変更するときは、次の順に読むのを推奨します。

1. `AGENTS.md`
2. `docs/PROJECT_MAP.md`
3. `docs/PATTERNS.md`
4. `docs/CHALLENGES.md`

## 主要ファイル

- [`src/components/TabsShell.tsx`](/Users/codingclef/workspace/koko/src/components/TabsShell.tsx): keep-alive アプリシェル
- [`src/components/tabs/CalendarTab.tsx`](/Users/codingclef/workspace/koko/src/components/tabs/CalendarTab.tsx): カレンダー実行コンテナ
- [`src/components/tabs/ShoppingTab.tsx`](/Users/codingclef/workspace/koko/src/components/tabs/ShoppingTab.tsx): 買い物一覧コンテナ
- [`src/components/tabs/SettingsTab.tsx`](/Users/codingclef/workspace/koko/src/components/tabs/SettingsTab.tsx): 設定と家族アクション
- [`src/hooks/useRealtimeSync.ts`](/Users/codingclef/workspace/koko/src/hooks/useRealtimeSync.ts): 共通broadcast購読パターン
- [`src/app/api/family/route.ts`](/Users/codingclef/workspace/koko/src/app/api/family/route.ts): 原子的な家族取得/作成
- [`src/app/api/family/join/route.ts`](/Users/codingclef/workspace/koko/src/app/api/family/join/route.ts): 招待コードによる家族参加
- [`src/app/api/cron/send-reminders/route.ts`](/Users/codingclef/workspace/koko/src/app/api/cron/send-reminders/route.ts): 定期リマインダー送信

## 環境変数

`.env.local` には少なくとも次を設定してください。

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
CRON_SECRET=
```

各変数の用途:

- `NEXT_PUBLIC_SUPABASE_URL`: 共通のSupabaseプロジェクトURL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: ブラウザクライアント認証と通常データアクセス
- `SUPABASE_SERVICE_ROLE_KEY`: RPCと保護テーブルアクセス用のサーバーadmin client
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: ブラウザのプッシュ購読登録
- `VAPID_PRIVATE_KEY`: サーバー側プッシュ送信
- `CRON_SECRET`: リマインダーcron endpointの保護

## ローカル開発

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

日常的に推奨するコマンド:

```bash
npm run lint
npm run test
npx tsc --noEmit
```

## テスト

現在のリポジトリには次の領域の回帰テストが含まれています。

- API routes
- Supabase連携の `lib/*`
- 共有 hooks
- カレンダー、買い物、設定、シェルUIの挙動

コードを変更するときは関連テストも更新し、作業完了前に `npx tsc --noEmit` を実行する必要があります。

## データベースメモ

スキーマとRLSは `supabase/migrations` にあります。

現在重要なテーブル:

- `families`
- `family_members`
- `allowed_emails`
- `user_preferences`
- `calendars`
- `calendar_members`
- `events`
- `event_reminders`
- `shopping_lists`
- `shopping_items`
- `push_subscriptions`

現在重要なRPCおよびmigrationベースの挙動:

- 原子的な家族作成
- 招待コードによる原子的な家族参加
- リマインダー取得と sent-at マーキング
- 家族、買い物、カレンダーメンバーシップのRLS修正

## ドキュメントメモ

`docs/PATTERNS.md` は維持すべき実装ルールをまとめます。
`docs/CHALLENGES.md` はそのルールが生まれた不具合と回帰背景を記録します。
