# Rollback checkpoint

## Latest checkpoint (2026-07-21 — before futuristic UX + nav sequence)

Created before configurable navigation order and futuristic interaction polish.

| Type | Name | Commit |
|---|---|---|
| Git tag | `checkpoint/pre-futuristic-nav-2026-07-21` | `268b5ab` |
| Branch | `rollback/pre-futuristic-nav-2026-07-21` | `268b5ab` |
| Main at checkpoint | Cartoon toggle discoverability | `268b5ab` |

### How to roll back to this checkpoint

**Inspect (safe):**
```bash
git fetch origin
git checkout checkpoint/pre-futuristic-nav-2026-07-21
```

**Restore main without rewriting published history (preferred for Lovable):**
```bash
git fetch origin
git checkout -b restore/pre-futuristic-nav origin/rollback/pre-futuristic-nav-2026-07-21
# open a PR into main, or fast-forward if appropriate
```

**Hard reset main (destructive — avoid if others rely on later commits):**
```bash
git checkout main
git reset --hard checkpoint/pre-futuristic-nav-2026-07-21
git push origin main
```

---

## Earlier checkpoint (before advanced PMO rebuild)

| Type | Name | Commit |
|---|---|---|
| Git tag | `checkpoint/pre-advanced-pmo-2026-07-21` | `abee0e5` |
| Branch | `rollback/pre-advanced-pmo-2026-07-21` | `abee0e5` |

```bash
git fetch origin
git checkout checkpoint/pre-advanced-pmo-2026-07-21
```
