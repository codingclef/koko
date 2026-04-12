# AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Koko Agent Guide

This file is the primary guide for any AI agent working in this repository.
Read this first, then follow the linked project documents before making changes.

## Read Order

1. `AGENTS.md` — repo-wide working rules
2. `docs/PROJECT_MAP.md` — feature map, ownership map, data model summary
3. `docs/PATTERNS.md` — implementation conventions and forbidden patterns
4. `docs/CHALLENGES.md` — background on past bugs and why current rules exist

## Project Summary

- Product: family collaboration PWA
- Main implemented areas: calendar, shopping lists, settings, family invite/join, push reminders
- Stack: Next.js 16, React 19, TypeScript, Tailwind CSS v4, Supabase, Web Push
- Deployment target: Vercel web app + installable PWA

## Before Any Action

These rules apply to every task without exception.

1. Before starting any task, including investigation, analysis, or implementation, confirm understanding by explaining back what the user is asking.
2. No action begins before the user's explicit approval. This includes reading files, investigating, executing commands, and writing code.

## Git Rules

1. Always work on a `feature/*` branch, then open a PR into `main`.
2. Commit at each unit of work. Do not batch unrelated changes.
3. Commit messages and PR titles must be written in English.
4. Direct push to `main` is prohibited.
5. Delete the feature branch after merge.
6. Prefer conventional titles in `type: summary` format.

### Commit and PR Naming

- Use lowercase conventional prefixes such as `feat:`, `fix:`, `refactor:`, `perf:`, `polish:`, `chore:`, `docs:`, `test:`.
- Keep the summary concise and specific to the user-visible or engineering change.
- PR titles should normally match the same `type: summary` style used in recent history.

### PR Body Format

- Include a `## Summary` section with flat bullets describing the main changes.
- Include a `## Testing` section describing what was run, or explicitly state that tests were not run.
- If manual visual verification is needed, include a checkbox list in the PR body.

## Working Rules

1. Before changing features or architecture, read `docs/PATTERNS.md`.
2. When asking the user to run a command or tool, include a Korean explanation.
3. Whenever code is written or modified, add or update tests with it.
4. After writing or modifying code, run `npx tsc --noEmit` before considering the work complete.
5. After creating a PR, monitor GitHub Actions CI until it completes. If any check fails, fix the issue and repeat until CI passes.
6. Manual visual verification items must be listed as checkboxes in the PR.

## Engineering Rules

1. Debug systematically. Fix root causes, not just local symptoms.
2. Prefer simple, readable code over clever or layered logic.
3. Verify behavior before marking work complete.

## Architecture Rules

### Layer Pipeline

```text
DB migration -> src/types/database.ts -> src/lib/ -> src/hooks/ (shared only) -> app/page -> components/
```

- Each layer depends only on the layer below it.
- Realtime subscription ownership stays at the page/tab layer.

### Tab Structure

- `/calendar` is the single live app entry point.
- `/shopping` and `/settings` redirect into the calendar shell.
- `TabsShell` keeps calendar, shopping, and settings mounted and only toggles visibility.

### Realtime Sync

- Use Supabase Realtime Broadcast, not `postgres_changes`.
- After mutations, manually send a refresh event.
- Only broadcast after the channel reaches `SUBSCRIBED`.

### Auth Flow

- Email allowlist lives in the `allowed_emails` table.
- OAuth flow depends on Supabase automatic code exchange.
- Do not call `exchangeCodeForSession` manually.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run test -- --testPathPattern=<path>
npm run test:watch
npx tsc --noEmit
```
