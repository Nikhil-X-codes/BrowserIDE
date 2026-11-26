# Security Policy & Architecture — BrowserIDE

This document describes the security model, trust boundaries, and safe-coding rules for **BrowserIDE**, including the 4 add-on features (Fix with AI, Live AI Tool-Call Progress, Interactive `jsh` Terminal, and Public `/share/[projectId]` links).

---

## 1. Trust Boundaries (Two Doors into Convex)

CloudAIIDE enforces strict separation between browser-initiated calls and trusted server-initiated calls:

### Door 1 — Client API (`convex/projects.ts`, `convex/files.ts`, `convex/conversations.ts`)
- Called from React via `useQuery` / `useMutation` with a Clerk JWT.
- **Every private query/mutation MUST:**
  1. Call `verifyAuth(ctx)` (throws `"Unauthorized"` if unauthenticated).
  2. Resolve the owning `projects` document and verify `project.ownerId === identity.subject`.
- Authentication alone is **never** sufficient; every file, folder, conversation, and message access must verify project ownership.

### Door 2 — Internal API (`convex/system.ts`)
- Called only from Next.js API routes (`src/app/api/**`) and Inngest background jobs via `ConvexHttpClient` (`src/lib/convex-client.ts`).
- Registered as public Convex functions because `ConvexHttpClient` cannot call `internalMutation`, so **every handler MUST call `validateInternalKey(args.internalKey)` as its very first statement**.
- Never import `api.system.*` into client components, hooks, or stores under `src/features/**` or `src/components/**`.
- Never prefix `CLOUDAIIDE_CONVEX_INTERNAL_KEY` with `NEXT_PUBLIC_`.

---

## 2. Public Project Sharing (`/share/[projectId]`)

Public sharing introduces a **strictly read-only** exception to Door 1:

- **Opt-in flag:** Projects are private by default (`isPublic` is `undefined` or `false`). Only the project owner can toggle `isPublic` via `projects.togglePublic` (which enforces `verifyAuth` + `ownerId === identity.subject`).
- **Read-only public queries (`projects.getPublicProject`, `files.getPublicFiles`):**
  - Return `null` (or throw) if `!project || project.isPublic !== true`.
  - **Never** expose `conversations`, `messages`, `exportRepoUrl`, or internal keys on public share routes.
  - **Never** expose mutations on `/share/[projectId]` — shared viewers can inspect files and boot the read-only WebContainer preview in their own browser tab, but cannot modify Convex rows.

---

## 3. In-Browser Runtime & Interactive `jsh` Terminal

- **Client-side isolation:** Both the WebContainer preview and the interactive `jsh` shell execute **entirely inside the user's browser tab** using StackBlitz WebContainers — never on the Next.js or Convex servers.
- **Cross-origin isolation headers:** `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` in `next.config.ts` are required for `SharedArrayBuffer` / WebContainers and must not be weakened.
- **No secret leakage:** Only files stored in the project's `files` table (excluding binaries) are mounted into the WebContainer. Server environment variables (`.env.local`, `GROQ_API_KEY`, `CLOUDAIIDE_CONVEX_INTERNAL_KEY`) never enter the browser runtime.

---

## 4. AI Agent, "Fix with AI", & Live Tool-Call Progress

- **"Fix with AI" Auto-Debugger:** Sends a bounded tail of client-side `terminalOutput` (capped to avoid oversized payloads) to `POST /api/messages`. The API route still enforces Clerk `auth()`, Zod validation, and project/conversation ownership before dispatching to Inngest.
- **Live Tool-Call Progress:** Agent tools push structured step updates (`{ id, tool, label, status }`) to Convex via `api.system.appendMessageStep`, which is guarded by `validateInternalKey`. Tool labels must not include raw secrets or environment variables.
- **Prompt / URL Scraping:** URLs passed to Firecrawl (`scrape-urls.ts`, `quick-edit/route.ts`) are fetched server-side; errors are caught and returned as strings rather than leaking stack traces.

---

## 5. Secrets & Environment Variables

- Never commit `.env*` files (except `.env.example`).
- GitHub OAuth tokens are retrieved per-request from Clerk (`clerkClient().users.getUserOauthAccessToken(userId, "github")`) and never stored in Convex or env vars.

## 6. Reporting a Vulnerability

If you discover a security issue in CloudAIIDE, please open a private security advisory on the repository or contact the maintainer directly rather than posting exploit details in a public issue.
