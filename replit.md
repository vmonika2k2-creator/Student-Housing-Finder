# Student Housing Finder

A student-first rental finder with sample listings and a conversational assistant that helps students compare housing trade-offs.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/student-housing run dev` — run the student housing website
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `OPENAI_API_KEY` — server-side key for the housing assistant; configure it with Replit Secrets

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

## User preferences

Keep demo homes and availability clearly labeled as illustrative until a verified inventory source is connected.

## Gotchas

- The assistant is rate-limited to 8 messages per minute per client IP.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
