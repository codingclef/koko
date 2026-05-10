# AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Repository rules for AI agents working in this project.

Read this file first. Then read:

1. `docs/PROJECT_MAP.md`
2. `docs/PATTERNS.md`
3. `docs/CHALLENGES.md`

## Project

- Product: family collaboration PWA
- Stack: Next.js 16, React 19, TypeScript, Tailwind CSS v4, Supabase, Web Push
- Deployment: Vercel web app + installable PWA

## Operating Principles

### Understand First

Do not guess. Do not hide uncertainty.

Before any work:

- Restate the request clearly.
- State assumptions that affect implementation.
- If multiple interpretations are possible, surface them.
- If the request is unclear enough to risk the wrong change, stop and ask.

### Keep It Simple

Implement the smallest solution that fully solves the task.

- Do not add features beyond the request.
- Do not introduce abstractions for single-use code.
- Do not add configurability that was not requested.
- Do not overbuild for hypothetical cases.

### Change Only What Is Required

Keep changes narrow.

- Do not refactor unrelated code.
- Do not clean up adjacent code unless required by the change.
- Match existing project patterns and style.
- Remove only the dead code created by your own change.
- Report unrelated issues separately.

Every changed line must be justified by the task or required verification.

### Verify the Result

Define success in verifiable terms.

- Bug fix: reproduce, fix, verify.
- Validation change: cover invalid cases, verify behavior.
- Refactor: preserve behavior, verify before and after.

## Approval Rule

No action begins before explicit user approval.

This includes:

- reading files
- investigating code
- running commands
- editing code
- creating commits
- opening pull requests

Before any action, restate the request and wait for approval.

## Workflow Rules

### Git

- Work only on a `feature/*` branch.
- Open pull requests into `main`.
- Never push directly to `main`.
- Commit in small, coherent units.
- Do not combine unrelated changes in one commit.
- Delete the feature branch after merge.

### Commit and PR Titles

- Use English.
- Use conventional lowercase prefixes: `feat:`, `fix:`, `refactor:`, `perf:`, `polish:`, `chore:`, `docs:`, `test:`.
- Use `type: summary` format.
- Keep summaries short and specific.

### PR Body

Include:

- `## Summary`
- `## Testing`

Rules:

- Use flat bullets under `## Summary`.
- State exactly what was tested.
- If tests were not run, say so explicitly.
- If manual visual verification is required, include checkbox items.

## Engineering Rules

- Read `docs/PATTERNS.md` before changing features or architecture.
- Fix root causes, not local symptoms.
- Prefer simple, readable code.
- Add or update tests with every code change.
- Verify behavior before marking work complete.

Before completion, run:

```bash
npx tsc --noEmit
```

After creating a PR:

- Monitor GitHub Actions until completion.
- If any check fails, fix it and repeat until CI passes.

## Communication Rule

When asking the user to run a command or tool, include a Korean explanation.

## Architecture Rules

### Layer Pipeline

```text
DB migration -> src/types/database.ts -> src/lib/ -> src/hooks/ (shared only) -> app/page -> components/
```

- Each layer depends only on the layer below it.
- Realtime subscription ownership stays at the page or tab layer.

### Tab Structure

- `/calendar` is the single live app entry point.
- `/reminders` and `/settings` redirect into the calendar shell.
- `/shopping` remains only as a legacy compatibility route.
- `TabsShell` keeps calendar, reminders, and settings mounted and only toggles visibility.

### Realtime

- Use Supabase Realtime Broadcast.
- Do not use `postgres_changes`.
- After mutations, send a refresh event manually.
- Broadcast only after the channel reaches `SUBSCRIBED`.

### Auth

- Email allowlist is stored in `allowed_emails`.
- OAuth relies on Supabase automatic code exchange.
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
