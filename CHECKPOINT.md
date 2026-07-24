# Rollback checkpoint

## Latest checkpoint (2026-07-24 — before project streams)

Created immediately before multi-stream capability (Program → Project → Streams).

| Type | Name | Commit |
|---|---|---|
| Git tag | `checkpoint/pre-streams-45cb` | `36737f2` (origin/main at tag time) |

### How to roll back to this checkpoint

**Inspect (safe):**
```bash
git fetch origin
git checkout checkpoint/pre-streams-45cb
```

**Restore main without rewriting published history (preferred for Lovable):**
```bash
git fetch origin
git checkout -b restore/pre-streams checkpoint/pre-streams-45cb
# open a PR into main
```

**Hard reset main (destructive — avoid if others rely on later commits):**
```bash
git checkout main
git reset --hard checkpoint/pre-streams-45cb
git push origin main
```

---

## Earlier checkpoints

| Type | Name | Notes |
|---|---|---|
| Git tag | `checkpoint/pre-futuristic-nav-2026-07-21` | Before nav sequence UX |
| Git tag | `checkpoint/pre-advanced-pmo-2026-07-21` | Before advanced PMO rebuild |
