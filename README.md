# SPORTY — Multi-Sport Management Platform

**SPORTY** is a multi-sport club management web application built with React, TypeScript, TanStack Router, Tailwind CSS, Supabase, and Google Sheets integration.

## Key Features

- **Multi-Sport Management**: Supports Cricket, Football, Basketball, Badminton, Volleyball, and administrator-created custom sports.
- **Role-Based Access Control**:
  - **Player**: Browse sports and teams, submit registration requests, view match fixtures, results, and profile settings.
  - **Administrator**: Create and manage sports, teams, rosters, match fixtures, record live/final scores, approve/reject registrations, and promote/demote admins.
- **Database & Security (Supabase PostgreSQL + Auth + RLS)**:
  - Database-enforced role assignments (public signup always creates a `player`).
  - Strict Row Level Security (RLS) on all tables (`profiles`, `user_roles`, `sports`, `teams`, `team_members`, `matches`, `player_registrations`, `activity_logs`, `sheets_sync_jobs`).
  - Automated activity logging and match validation triggers.
- **Server-Side Google Sheets Synchronization**:
  - Supabase Edge Function (`sync-sheets`) using Google Service Account RS256 JWT.
  - Automatically verifies and creates `Registrations` sheet with 7 required columns:
    `Timestamp`, `Registration ID`, `Player ID`, `Player Name`, `Email`, `Sport`, `Registration Status`.
  - Idempotent deduplication using stable `Registration ID`.
- **Live Scoreboard & Standings**:
  - Live scores, finished results, and standings points table (3 pts for win, 1 pt for draw, 0 for loss).

## Tech Stack

- **Frontend**: React 19, TypeScript, TanStack Start, TanStack Router, TanStack Query, Tailwind CSS v4, Lucide React, Recharts, Sonner, Radix UI.
- **Backend / Database**: Supabase PostgreSQL, Supabase Auth, Row Level Security, Supabase Edge Functions (Deno).
- **Integrations**: Google Sheets API v4 (Service Account).
- **Testing & Quality**: Vitest, React Testing Library, ESLint, Prettier, Zod validation.

## Environment Variables

Copy `.env.example` to `.env`:

```env
# Frontend / Client Environment Variables
VITE_SUPABASE_URL="https://<project-id>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<supabase-publishable-key>"
```

### Server-Side Edge Function Secrets

Configure via Supabase CLI or Supabase Dashboard -> Edge Functions -> Secrets:

```bash
supabase secrets set GOOGLE_SHEETS_SPREADSHEET_ID="<your_google_sheet_id>"
supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL="<service-account@project.iam.gserviceaccount.com>"
supabase secrets set GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Getting Started

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start development server
npm run dev

# Run unit tests
npm test

# Production build
npm run build
```

## Deployment

Deployable to Vercel or Lovable Cloud:
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in your hosting provider's environment variables.
