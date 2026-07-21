# Rollback checkpoint

Created before the advanced PMO features + professional UI rebuild.

## Identifiers

| Type | Name | Commit |
|---|---|---|
| Git tag | `checkpoint/pre-advanced-pmo-2026-07-21` | `abee0e5` |
| Branch | `rollback/pre-advanced-pmo-2026-07-21` | `abee0e5` |
| Main at checkpoint | chart legend scroll fix | `abee0e5` |

## How to roll back

**Inspect the checkpoint (safe):**
```bash
git fetch origin
git checkout checkpoint/pre-advanced-pmo-2026-07-21
```

**Restore main to the checkpoint (destructive to later commits on main):**
```bash
git fetch origin
git checkout main
git reset --hard checkpoint/pre-advanced-pmo-2026-07-21
git push origin main
```

> Prefer creating a revert PR instead of force-pushing if others are using `main`.
> Lovable-connected history should not be rewritten with force-push/rebase when avoidable.

**Or open the rollback branch:**
```bash
git checkout rollback/pre-advanced-pmo-2026-07-21
```
