# Rollback checkpoint

## Latest checkpoint (2026-11-23 — before security hardening)

Taken at the current `main` junction immediately before merging
tenant-isolation / DEFINER RPC / FORCE RLS work (PR #316).

| Type | Name | Commit |
|---|---|---|
| Git tag | `checkpoint/pre-security-hardening-95b2` | `ab8fa99` (origin/main at tag time) |
| Branch | `cursor/checkpoint-pre-security-hardening-95b2` | same SHA |

App rollback restores that commit. It does **not** undo Supabase SQL. The
`20261123*` migrations are additive (stricter grants and FORCE RLS). Leave
them applied if you restore the app; do not write a down-migration unless
you are sure you need to reopen those RPCs.

### How to roll back to this checkpoint

**Inspect (safe):**
```bash
git fetch origin
git checkout checkpoint/pre-security-hardening-95b2
```

**Restore main without rewriting published history (preferred):**
```bash
git fetch origin
git checkout -b restore/pre-security-hardening checkpoint/pre-security-hardening-95b2
# open a PR into main
```

**Hard reset main (destructive — avoid if others rely on later commits):**
```bash
git checkout main
git reset --hard checkpoint/pre-security-hardening-95b2
git push origin main
```

---

## Earlier checkpoints

| Type | Name | Notes |
|---|---|---|
| Git tag | `checkpoint/pre-streams-45cb` | Before multi-stream (Program → Project → Streams) |
| Git tag | `checkpoint/pre-futuristic-nav-2026-07-21` | Before nav sequence UX |
| Git tag | `checkpoint/pre-advanced-pmo-2026-07-21` | Before advanced PMO rebuild |
