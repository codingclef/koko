# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Koko - Family Hub App

## Project Stack
- **Frontend**: Next.js (TypeScript, Tailwind CSS, App Router)
- **Backend**: Supabase (PostgreSQL, Realtime, Auth)
- **Deployment**: Vercel (web), PWA for mobile

## Git Rules
1. Always work on a `feature/*` branch → PR → merge to main
2. Commit at each unit of work (do NOT batch commits)
3. Commit messages and PR titles must be written in English
4. Direct push to main is prohibited (branch protection enabled)
5. After a PR is merged, delete the feature branch immediately

## Before Any Action
1. Before starting any task (investigation, analysis, or implementation), confirm understanding by explaining back what the user is asking
2. Implementation begins only after the user's explicit approval

## Development Rules
1. When asking the user to run a command or tool, always include a Korean explanation
2. Whenever code is written or modified, unit tests must also be written or modified
3. Use GitHub Actions CI — tests must pass before merging
4. Items requiring manual visual verification by the user must be listed as checkboxes in the PR (exclude automated test items)
5. Before adding or modifying features, read PATTERNS.md first

## Commands

```bash
npm run dev          # dev server (localhost:3000)
npm run build        # production build
npm run lint         # ESLint
npm run test         # run all tests
npm run test -- --testPathPattern=<path>  # run single test file
npm run test:watch   # watch mode
```

## Architecture

### Layer Pipeline

```
DB migration → src/types/database.ts → src/lib/ → src/hooks/ (shared only) → app/page → components/
```

Each layer depends only on the layer below it. Real-time subscription is managed only at the page layer.

### Tab Structure (CSS Keep-Alive)

`/calendar` is the single entry point; `/shopping` and `/settings` redirect here.
`TabsShell` keeps all three tabs permanently mounted and toggles visibility with `display: contents` / `display: none` — prevents re-fetch and spinner on tab switch.

### Real-time Sync

Uses Supabase Realtime **Broadcast** channel (not `postgres_changes`).
After any mutation, manually call `channel.send()` to broadcast a refresh event to other devices.
Only send after the channel is `SUBSCRIBED` — track readiness with `channelReadyRef`.

### Auth Flow

Email allowlist is stored in the `allowed_emails` DB table (not env vars — avoids Vercel redeployment on member changes).
OAuth: Supabase auto-exchanges the code → `onAuthStateChange('SIGNED_IN')` → check allowlist → allow or sign out.
Do **not** call `exchangeCodeForSession` manually; it conflicts with Supabase's automatic exchange.
