# 🏠 Koko — Family Hub

[한국어](README.ko.md) | [日本語](README.ja.md) | **[English]**

A real-time family collaboration app that brings together your calendar, shopping list, and memos in one place.
Accessible from any device — iOS, Android, and web — with instant sync across all family members.

---

## Features

| Feature | Description |
|---------|-------------|
| Calendar | Create and manage family events, set reminders with push notifications |
| Shopping List | Add items, check them off in real time, strike through completed items |
| Memo | Shared family notes, accessible by everyone instantly |
| Event Voting | Poll family members on availability before scheduling |
| Real-time Sync | All changes reflected instantly across every device |
| PWA Support | Install on iPhone / Android home screen — works like a native app |

---

## How It Works

```
Family Member Action
(Add event · Check item · Write memo · Cast vote)
    │
    ▼
Supabase Realtime
    Change detected via PostgreSQL logical replication
    → WebSocket broadcast to all connected devices
    │
    ▼
All Devices Updated
    Calendar / Shopping List / Memo refreshed instantly
    │
    ▼
Push Notification (if applicable)
    Firebase Cloud Messaging → iOS & Android
```

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Frontend | Next.js 16 (TypeScript, Tailwind CSS, App Router) |
| Backend / DB | Supabase (PostgreSQL, Realtime, Auth) |
| Push Notifications | PWA Web Push (iOS 16.4+, Android) |
| CI/CD | GitHub Actions |
| Hosting | Vercel |

---

## Project Structure

```
koko/
├── src/
│   ├── app/                # Next.js App Router pages
│   ├── components/         # Shared UI components
│   ├── lib/                # Supabase client, utilities
│   └── types/              # TypeScript type definitions
├── public/                 # Static assets, PWA manifest
├── .github/workflows/      # GitHub Actions CI
└── CLAUDE.md               # AI coding agent instructions
```

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

