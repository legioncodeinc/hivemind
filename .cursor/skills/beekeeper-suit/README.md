# Beekeeper-Suit

The master routing skill for the Beekeeper-Suit repository Cursor setup.

Beekeeper-Suit does not perform work. It routes the primary Cursor agent's tasks to the correct Bee (subagent) in the Army, passing along the paired Stinger (skill) so every delegation arrives fully equipped.

## Entry point

- [`SKILL.md`](./SKILL.md) — the skill definition Cursor loads.

## Roster

Each Bee has a dedicated, in-depth guide:

- [`guides/asset-worker-bee.md`](guides/asset-worker-bee.md)
- [`guides/auth-worker-bee.md`](guides/auth-worker-bee.md)
- [`guides/db-worker-bee.md`](guides/db-worker-bee.md)
- [`guides/design-system-worker-bee.md`](guides/design-system-worker-bee.md)
- [`guides/devops-worker-bee.md`](guides/devops-worker-bee.md)
- [`guides/library-worker-bee.md`](guides/library-worker-bee.md)
- [`guides/mind-worker-bee.md`](guides/mind-worker-bee.md)
- [`guides/payments-worker-bee.md`](guides/payments-worker-bee.md)
- [`guides/quality-worker-bee.md`](guides/quality-worker-bee.md)
- [`guides/react-worker-bee.md`](guides/react-worker-bee.md)
- [`guides/security-worker-bee.md`](guides/security-worker-bee.md)
- [`guides/seo-aeo-worker-bee.md`](guides/seo-aeo-worker-bee.md)
- [`guides/ux-ui-worker-bee.md`](guides/ux-ui-worker-bee.md)

## Adding new Bees

The Legendary Bee Factory forges new Bees end to end. To register a new Bee with Beekeeper-Suit after the Factory has produced the artifacts:

1. Add the Bee to the roster table in [`SKILL.md`](./SKILL.md).
2. Author a new guide under [`guides/`](./guides/) using [`templates/guide-template.md`](./templates/guide-template.md).
3. Update the multi-Bee orchestration section in `SKILL.md` if the new Bee fits an existing sequence.

## Philosophy

See [`references/philosophy.md`](./references/philosophy.md) for the rationale behind routing over generalization.

---

*Part of the Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
