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

## Before Implementation
1. Before starting implementation, explain back the requirements to the user
2. Implementation begins only after the user's explicit approval

## Development Rules
1. When asking the user to run a command or tool, always include a Korean explanation
2. Whenever code is written or modified, unit tests must also be written or modified
3. Use GitHub Actions CI — tests must pass before merging
4. Items requiring manual visual verification by the user must be listed as checkboxes in the PR (exclude automated test items)
5. Before adding or modifying features, read PATTERNS.md first
