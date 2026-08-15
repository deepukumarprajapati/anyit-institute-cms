# Session history (portable via git)

Cursor **does not sync** local Agent/Chat UI across laptops. History lives on each machine.

This folder keeps **project continuity** in git so another laptop gets the same decisions after `git pull`.

## What’s here

| File | Purpose |
|------|---------|
| `SUMMARY-2026-08-fees.md` | Human-readable decisions from the fees / student-profile workstream |
| `../AGENTS.md` (repo root) | Always-on agent briefing |
| `.cursor/rules/institute-cms.mdc` | Always-apply Cursor rule |

## On a new laptop

1. Clone / pull this repo  
2. Open the **same project folder** in Cursor (signed in with your account)  
3. New Agent chat: context loads from `AGENTS.md` + `.cursor/rules`  
4. Optional: attach `docs/session-history/SUMMARY-*.md` if you need the full narrative  

Native Cursor sidebar chats from the old PC will **not** appear unless you use a third-party sync (SpecStory, cursaves) or copy `%APPDATA%\Cursor\User\workspaceStorage` with **identical project paths**.

## Export more chats later

```powershell
npm run export:session
```

Or manually copy a transcript from:

`%USERPROFILE%\.cursor\projects\*\agent-transcripts\**\*.jsonl`

into this folder (do not commit secrets).
