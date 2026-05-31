# WaiChat — Agent Guide

Orientation map for coding agents. WaiChat = "Workers AI Chat": an open-source AI chat app on Cloudflare's free tier. Single package, two halves: **client** (`src/client`, React 19 + Vite + Tailwind v4 SPA) and **worker** (`src/worker`, Hono on Cloudflare Workers). No monorepo, no router lib, no state lib, no test suite. Verified against `v0.1.5-alpha.2`.

## Stack & bindings
- Client: React 19, Vite 8, Tailwind v4 (config in `index.css` via `@theme`/`@custom-variant`, **`.dark` class**, not OS default), `react-markdown`+`remark-gfm`, `react-syntax-highlighter` (Prism), `lucide-react`, `fflate` (zip).
- Worker: Hono ^4.12, Workers AI (`AI`), D1 (`DB`). **No KV / R2 / Durable Objects / Queues.**
- Bindings (`wrangler.jsonc`, `src/worker/types.ts` `Env`): `AI` (req), `DB` (req), and optional secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (live model list), `SECRET_KEY` (AES key to encrypt CF creds stored in D1).

## Where things live
```
src/worker/
  index.ts            Hono app: ALL /api routes, model scoring/formatting, /api/chat SSE pipeline
  ai.ts               AVAILABLE_MODELS (hardcoded), streamAiResponse (ai.run stream), generateTitle
  db.ts               D1 helpers (raw parameterized SQL) + AES-GCM encrypt/decrypt for secrets
  types.ts            Env + Conversation/Message/Model/SystemPrompt/ChatRequest
  config/model-exclusions.ts  exclusion lists + DATE-BASED deprecation schedule (cutoff 2026-05-29)
src/client/
  App.tsx             State hub: custom routing, theme, drafts, settings, system-prompt/model sync
  main.tsx            Entry: StrictMode > ToastProvider > App
  index.css           Tailwind v4; brand tokens cloud=#0a84ff local=#ff9f0a temporary=#a855f7
  hooks/useChat.ts    CORE: message TREE state, /api/chat SSE consumption, send/edit/retry/stop, branching
  hooks/useModels.ts  GET /api/models; FALLBACK_MODELS + DEFAULT_MODEL_ID
  hooks/useToast.tsx  Split state/actions contexts, dedup, max 3
  hooks/useTransfer.ts  Cloud↔local move; pending-cloud-delete retry queue in localStorage
  storage/index.ts    StorageAdapter interface + createStorage(mode) factory  ← the cloud/local split
  storage/local.ts    localStorage adapter (also powers temporary mode)
  storage/cloud.ts    fetch → /api adapter
  utils/{import,export}Utils.ts  workspace backup = ZIP (fflate) of ChatGPT-format conversations
  utils/chatExport.ts            single chat → Markdown (blob) / PDF (window.print)
  components/         flat, no barrel; default exports except Toast (named ToastContainer)
migrations/           D1 SQL, applied 0001→0011 in order
scripts/patch-db-id.mjs  writes provisioned database_id into wrangler.jsonc at deploy
dist/ .wrangler/      GENERATED — do not edit
```

## API surface (all in `src/worker/index.ts`, prefix `/api`)
`cors()` on `/api/*` only. **No auth middleware** anywhere; each route does its own try/catch.

| Method · Path | Notes |
| --- | --- |
| `GET /models` | 1h in-memory cache; live-fetch if creds else hardcoded fallback |
| `GET·POST·DELETE /secrets` | CF cred config; POST validates then AES-stores in D1; needs `SECRET_KEY` |
| `GET /conversations` · `POST /conversations` | list; create `{model, system_prompt_id?, system_prompt?}` |
| `GET /conversations/search?q=` | LIKE over title + non-deleted content; LIMIT 50 |
| `GET·DELETE /conversations/:id` · `PATCH /conversations/:id` | get(+messages)/hard-delete/update `{model?,title?}` |
| `DELETE /conversations` | ⚠️ wipes the ENTIRE table, no confirm/auth |
| `POST /conversations/import` | bulk import `{conversation, messages[]}` |
| `POST /conversations/:cid/messages` | **upsert** a message (comment says "delete" — wrong) |
| `DELETE /conversations/:cid/messages/:mid` | recursive **soft**-delete of subtree |
| `GET·POST·PATCH·DELETE /system-prompts[/:id]` | CRUD; upsert is last-write-wins by `updated_at` |
| `GET·POST /settings/:key` | whitelist only: `system_prompt`, `default_model` |
| `GET /export` | full `{conversations, messages(non-deleted), settings}` |
| `POST /title` · `POST /chat` | title gen; **core streaming endpoint** |

**`/api/chat`**: branches on `storage_mode` (`isCloud = mode !== "local"`). Cloud → server saves user msg, auto-titles first msg, pipes the AI stream through a `TransformStream` accumulating `fullContent`, persists assistant msg in `finally` wrapped in `executionCtx.waitUntil` (survives client disconnect). Local/temporary → returns raw SSE; client persists. Token shape handled BOTH ways: OpenAI `choices[0].delta.content` and Workers `response`. `max_tokens: 2048`.

## D1 schema (from `migrations/`)
- **conversations**: `id` PK, `title`, `model`, `storage_mode` (legacy), `created_at`, `updated_at`, `import_complete?`, `system_prompt_id?`, `system_prompt?`.
- **messages**: `id` PK, `conversation_id` FK→conversations CASCADE, `role` CHECK(user|assistant), `content` (blanked on soft-delete), `created_at`, `model?`, `parent_id?` (branch tree, in-app not DB FK), `deleted_at?`.
- **settings**: `key` PK, `value`, `updated_at`. Also stores encrypted CF creds (`cf_account_id`, `cf_api_token`) and `default_model`/`system_prompt`.
- **system_prompts**: `id` PK, `user_id` (hardcoded `'default'` — single user), `name`, `content`, `created_at`, `updated_at?`.

## Storage modes (`StorageMode = cloud | local | temporary`)
`createStorage(mode)` dispatches: `cloud`→CloudStorage (fetch /api, server owns data), `local`→LocalStorage(false), `temporary`→LocalStorage(true). LocalStorage keys: `waichat:conversations` (one array, persistent+temp separated by `is_temporary`), `waichat:messages:<id>`, `waichat:versions:<id>` (branch selections), `waichat:temp-expiry`. Temporary chats carry `expires_at`, purged by `cleanup()` on mount + every 60s; never get a URL. `useTransfer` moves convos between modes (export→import→delete source). Other `waichat:`-prefixed localStorage keys hold theme, storage-mode, default-model, sync flag, system prompts, drafts are in-memory only.

## Routing (custom, History API in `App.tsx`)
URL = `/c/<cloud|local>/<id>`; `/` = home; temporary never sets a URL. Back/forward across modes triggers `window.location.reload()`. SPA fallback via `not_found_handling: "single-page-application"`.

## Conventions
- PascalCase components, default exports (except `Toast` named export), inline `<Component>Props`, no barrel files, co-located sub-components (e.g. `MessageList` holds `ThoughtParser`/`CodeBlockWrapper`/`MarkdownRenderer`). Tailwind-only styling, heavy `dark:`.
- Worker: thin Hono handlers, raw SQL in `db.ts` (no ORM), inline validation (length caps, key whitelists), upsert via `ON CONFLICT DO UPDATE` last-write-wins, batched writes chunked under D1's 100-param limit.
- **Branching**: edits/retries create sibling messages under the same `parent_id`; active path chosen by `activeVersions` (persisted per convo); `<think>` blocks parsed/rendered client-side only (`MessageList.tsx`), stored raw.
- Types are **duplicated** worker↔client (no shared module); the wire contract (JSON shapes + SSE) is the real interface. Single `tsconfig.json`, no path aliases, relative imports.
- No Antigravity / Cursor / agent-workflow files in repo; `.github/workflows/*` are standard GitHub Actions (ci = type-check+build; the other 3 are fork-only deploy management).

## Dev / deploy
```
pnpm install
cp wrangler.local.jsonc.example wrangler.local.jsonc   # paste database_id
pnpm db:migrate:local          # local D1
pnpm dev:worker                # :8787   (wrangler)
pnpm dev:client                # :5173   (vite; proxies /api → :8787)
pnpm type-check                # tsc --noEmit   (CI gate; no tests exist)
pnpm deploy:production         # build:assets → db:migrate:remote → wrangler deploy
```
Fork→Cloudflare deploy auto-provisions D1/AI and runs `build` (assets → deploy → patch-db-id → migrate:binding). CF creds also settable at runtime via Settings→Models (encrypted into D1). No built-in auth — gate with Cloudflare Access (`docs/self-hosting.md`).

## Gotchas (won't re-derive)
- `DELETE /api/conversations` nukes everything, unauthenticated.
- `db.getMessages` returns soft-deleted rows on purpose (callers filter); `/api/export` + search filter `deleted_at IS NULL`.
- Model exclusion is **wall-clock dependent** (cutoff `2026-05-29`); past that, scheduled models are hidden.
- `POST /conversations/:cid/messages` is an upsert despite a "Delete a single message" comment.
- `createConversation`/`updateConversationModel` in `db.ts` are effectively dead — routes inline their own SQL.
- `importConversation` imports only the 5 base conversation columns (drops `system_prompt*`).
- No server-side `<think>` stripping; reasoning tokens flow through and are stored.
