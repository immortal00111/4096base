# CLAUDE.md

Standing instructions for working in this repo.

## Workflow rules
- After ANY code change, verify it yourself before reporting. Don't report done until you've run the checks.
- Every time:
  1. Run build/typecheck (`npm run build` or `tsc --noEmit`) and fix errors.
  2. Run the linter if configured (`npm run lint`).
  3. Confirm `npm run dev` starts cleanly.
  4. For game-logic changes, verify the core 4096 merge rules still behave.
- If `node`/tools aren't found in your shell, fix it yourself first: `eval "$(/opt/homebrew/bin/brew shellenv)"`. Only ask the user for a password/sudo step or a money/product decision.
- In the final report, state what you verified and the real result. Never claim it works if you haven't run it.

## Project facts
- 4096base: React + TypeScript + Vite, 2048-style game, goal tile 4096. Node via Homebrew at `/opt/homebrew`.
- Never add wallet/payment/token/NFT/blockchain code unless the task explicitly says to.

## Approvals
Auto-approve (no need to ask) — low-risk, reversible, local:
- Editing/creating/deleting source files in this project
- Running: build, typecheck, lint, dev server, the game tests
- npm install of normal project dependencies
- Reading files and standard git: status, diff, add, commit
- Setting brew/node on PATH

Always ask the user first — irreversible, money, or external effects:
- git push, or anything that changes git history/remotes
- Any command using sudo or needing a password
- Any wallet/payment/token/NFT/blockchain action, deploys, or contract calls
- Sending real funds or anything on mainnet
- Deleting files outside this project, or bulk/irreversible deletions
- Installing global system software or changing system settings
