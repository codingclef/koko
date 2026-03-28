# 🏠 Koko — 패밀리 허브

**[한국어]** | [日本語](README.ja.md) | [English](README.md)

캘린더, 장바구니, 메모를 하나로 통합한 가족 실시간 협업 앱입니다.
iOS, Android, 웹 어디서든 접속 가능하며, 모든 가족에게 변경사항이 즉시 반영됩니다.

---

## 기능

| 기능 | 설명 |
|------|------|
| 캘린더 | 가족 일정 등록 및 관리, 푸시 알림 설정 |
| 장바구니 | 아이템 추가, 실시간 체크, 완료 항목 취소선 표시 |
| 메모 | 가족 공유 메모, 모든 기기에 즉시 반영 |
| 일정 투표 | 일정 확정 전 가족 참석 가능 여부 투표 |
| 실시간 동기화 | 모든 변경사항이 전체 기기에 즉시 반영 |
| PWA 지원 | 아이폰 / 안드로이드 홈 화면에 추가 — 네이티브 앱처럼 동작 |

---

## 동작 방식

```
가족 구성원 액션
(일정 추가 · 장바구니 체크 · 메모 작성 · 투표)
    │
    ▼
Supabase Realtime
    PostgreSQL 변경 감지
    → WebSocket으로 연결된 모든 기기에 즉시 브로드캐스트
    │
    ▼
전체 기기 업데이트
    캘린더 / 장바구니 / 메모 즉시 반영
    │
    ▼
푸시 알림 (해당하는 경우)
    PWA Web Push → iOS 및 Android
```

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| 프론트엔드 | Next.js 16 (TypeScript, Tailwind CSS, App Router) |
| 백엔드 / DB | Supabase (PostgreSQL, Realtime, Auth) |
| 푸시 알림 | PWA Web Push (iOS 16.4+, Android) |
| CI/CD | GitHub Actions |
| 호스팅 | Vercel |

---

## 프로젝트 구조

```
koko/
├── src/
│   ├── app/                # Next.js App Router 페이지
│   ├── components/         # 공통 UI 컴포넌트
│   ├── lib/                # Supabase 클라이언트, 유틸리티
│   └── types/              # TypeScript 타입 정의
├── public/                 # 정적 파일, PWA 매니페스트
├── .github/workflows/      # GitHub Actions CI
└── CLAUDE.md               # AI 코딩 에이전트 지침
```

---

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

### 환경 변수

프로젝트 루트에 `.env.local` 파일을 생성하세요:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

## 개발 규칙

- 모든 작업은 `feature/*` 브랜치 → PR → main 머지
- main 브랜치 다이렉트 push 금지
- 코드 작성/수정 시 반드시 유닛 테스트 함께 작성
- GitHub Actions CI 통과 후 머지
