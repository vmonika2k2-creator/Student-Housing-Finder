# Student Housing Finder

A student-first rental finder with sample listings and a conversational assistant that helps students compare housing trade-offs.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/student-housing run dev` — run the student housing website
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- If `/admin` reports that the settings schema is out of date: in the Replit **Development Shell**, run `pnpm --filter @workspace/db run push` and approve the pending schema changes. When it finishes, click **Publish** to sync the production app's database schema, then reload `/admin`. Keep Replit's managed `DATABASE_URL` and database name unchanged; do not run schema pushes from a published/production shell.
- Required secret: `OPENAI_API_KEY` — server-side key for the housing assistant; configure it with Replit Secrets
- Required secret: `ADMIN_PASSWORD` — password for the admin panel at `/admin` (optional `ADMIN_SESSION_SECRET` overrides the cookie signing key)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/student-housing/` — student-facing rental finder
- `artifacts/api-server/src/routes/student-housing/` — illustrative listing catalog and assistant route
- `lib/api-spec/openapi.yaml` — listing/chat API contract

## Architecture decisions

- The assistant must make a real server-side OpenAI call using the project's `OPENAI_API_KEY` and return the generated reply; never ship a canned or stubbed response. Do not switch back to the managed integration without asking.
- Chat history is held in the browser for the session and sent to OpenAI only after the interface discloses this.
- Rental records and property imagery are illustrative only, not claims of available homes.

## Product

Students can filter and save demo rentals across Bengaluru, Pune, and Hyderabad, then ask an AI guide to compare budget, privacy, amenities, and transit. All inventory and prices are illustrative.

## Admin panel

`/admin` (password-protected) lets an admin set the assistant's persona, tone, empathy (0-10) with an example reply for each of five empathy stages (0-1, 2-3, 4-6, 7-8, 9-10), and initiative (passive to goal-oriented, 0-10) with a goal textbox. Settings are stored in the `student_housing_agent_settings` table and added to the assistant's system prompt on every chat request, with the stage matching the current empathy value marked as the one to follow. They change style only and cannot override the accuracy and safety rules.

If the public admin page returns PostgreSQL error `42703` or says the settings schema is out of date, the deployed database is missing columns expected by the current app version. This is not fixed by changing the database name. Sync the schema in Replit Development using the command above, then Publish so Replit updates the production schema. The app deliberately does not run database alterations at startup or from public requests.

## User preferences

Keep demo homes and availability clearly labeled as illustrative until a verified inventory source is connected.

## Gotchas

- The assistant is rate-limited to 8 messages per minute per client IP.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
