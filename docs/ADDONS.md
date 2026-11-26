# BrowserIDE Add-Ons Guide

This document describes the 4 production & resume-ready add-ons implemented on top of BrowserIDE.

---

## 1. "Fix with AI" Auto-Debugger (`WebContainer → Agent Loop`)

- **Where:** `src/features/projects/components/preview-view.tsx`, `src/features/conversations/hooks/use-conversations.ts`
- **How it works:**
  1. When `useWebContainer` enters `status === "error"` (e.g., `npm install` or `npm run dev` fails), `PreviewView` displays a **"Fix with AI"** button alongside **Restart**.
  2. Clicking **"Fix with AI"** slices the last ~50 lines of `terminalOutput` + `error`, finds (or creates) a conversation for the project, and posts a diagnostic prompt to `POST /api/messages`.
  3. The Inngest coding agent inspects the project files and patches the broken code; Convex live queries push the fix straight back into the editor and WebContainer.

---

## 2. Live AI Tool-Call Progress

- **Where:** `convex/schema.ts`, `convex/system.ts`, `src/features/conversations/inngest/process-message.ts`, `src/features/conversations/inngest/tools/*`, `src/features/conversations/components/conversation-sidebar.tsx`
- **How it works:**
  1. The `messages` table includes an optional `steps` array:
     `{ id: string, tool: string, label: string, status: "running" | "completed" | "error" }`.
  2. Each agent tool calls `system.upsertMessageStep` (guarded by `CLOUDAIIDE_CONVEX_INTERNAL_KEY`) when starting and finishing work (e.g., *"Listing project files"*, *"Creating src/App.tsx"*).
  3. Because the chat sidebar subscribes to `api.conversations.getMessages`, users see real-time tool progress while the message is `processing`.

---

## 3. Interactive `jsh` Browser Terminal

- **Where:** `src/features/preview/hooks/use-webcontainer.ts`, `src/features/preview/components/preview-terminal.tsx`, `src/features/projects/components/preview-view.tsx`
- **How it works:**
  1. `useWebContainer` exposes a `spawnShell()` / interactive shell stream using `container.spawn("jsh", { terminal: { cols, rows } })` once the container has booted.
  2. `PreviewTerminal` supports switching between **Logs** (read-only install/dev server output) and **Shell** (interactive `xterm` where user keystrokes write directly to `shellProcess.input`).

---

## 4. Public Read-Only Share Links (`/share/[projectId]`) + Vitest & GitHub Actions CI

- **Public Sharing:**
  - `projects.isPublic` (`v.optional(v.boolean())`) controls whether a project is publicly viewable.
  - `projects.togglePublic` lets the authenticated owner toggle sharing from the project navbar.
  - `projects.getPublicProject` and `files.getPublicFiles` serve read-only data **only** when `project.isPublic === true`.
  - `src/app/share/[projectId]/page.tsx` renders a read-only workspace (file tree + read-only CodeMirror + live WebContainer preview) with no login required.
- **Testing & CI:**
  - **Vitest** (`vitest.config.ts`) runs unit tests under `src/**/*.test.ts` (`npm test`).
  - **GitHub Actions** (`.github/workflows/ci.yml`) runs `npm run lint`, `npm test`, and `npm run build` on pushes and pull requests.
