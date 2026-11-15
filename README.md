# reoohb — Out Of Here Bots

Early prototype for a privacy-conscious website verification service.

## What's in this first build

- Landing page and developer sign-up / login using Supabase Auth.
- Authenticated dashboard.
- Create website projects and register domains.
- Per-user project access enforced by PostgreSQL Row Level Security.
- Public project IDs for identifying a project.

## Supabase

This prototype uses the existing **WALLZ by echo** Supabase project. The frontend contains only the project's publishable key, which is designed for public client use. Never put a Supabase secret/service-role key in browser code.

The `reoohb_projects` table is isolated by name and has RLS policies restricting rows to their owner.

## Run locally

Open `index.html` through a local static web server (or deploy the repository with GitHub Pages).

In Supabase Dashboard → Authentication → URL Configuration, add the deployed site URL to the allowed redirect URLs. Email confirmation settings are managed in Supabase Auth.

## Important: not production verification yet

This is the account/project dashboard foundation only. It does **not** yet detect bots or issue/validate verification codes. The next stage is a server-side verification API (Supabase Edge Function or another trusted backend), short-lived single-use authorization codes, domain validation, rate limiting, and security testing. Do not rely on browser-only mouse checks or treat a browser result as proof of a human.

Voice verification is not implemented. Any future behavioral checks should be disclosed, minimized, and designed with alternatives and accessibility in mind.
