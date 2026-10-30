<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project & Execution Rules (citemend)

1. **Read First:** Always read `PLAN.md` and inspect existing files in `app/`, `components/`, and `lib/` before writing any code.
2. **Protect Working Code:** Never overwrite or break existing working features from previous days. Only edit the files needed for the current day's task.
3. **Complete Implementation Only:** Do not leave broken placeholders or `// TODO` comments unless `PLAN.md` specifically asks for a placeholder.
4. **Self-Verify Every Change:** Run lint (`npm run lint`) and a production build (`npm run build`) after completing a task, and fix any TypeScript or build errors before finishing.
5. **Git Safety:** Keep commits clean and only commit after verifying that lint and production build pass.
6.
