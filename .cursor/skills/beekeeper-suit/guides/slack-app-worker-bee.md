# Slack App Worker-Bee — Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `slack-app-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/slack-app-worker-bee.md`](../../agents/slack-app-worker-bee.md)
**Stinger:** [`.cursor/skills/slack-app-stinger/`](../../skills/slack-app-stinger/)
**Trigger policy:** proactive

---

## Domain

`slack-app-worker-bee` owns the Slack app developer surface: Bolt SDK setup (JS/Python/Java), slash commands, Block Kit UI composition, modal/view lifecycle, the Events API subscription and signature-verification model, OAuth 2.0 multi-workspace installation flows, and App Directory / Marketplace submission (including the December 2024 LLM-training-prohibition policy). It explicitly does not cover the Deno Slack SDK or the Workflow Builder next-generation platform.

## Trigger phrases

Route to `slack-app-worker-bee` when the user says any of:

- "build a Slack app"
- "add a slash command" / "create a Slack modal"
- "set up Slack Events API"
- "multi-workspace OAuth install"
- "submit to Slack Marketplace" / "Slack app review"

Or when any Slack-specific developer surface (Bolt, Block Kit, Events API, OAuth install) is in scope.

## Do NOT route when

- The request is CI/CD pipeline topology or deployment infrastructure → `devops-worker-bee`
- The request is secrets-vault configuration or a token security audit → `security-worker-bee`
- The request is Django/FastAPI backend architecture beyond the Bolt integration layer → `python-worker-bee`
- The request is Slack Connect / Enterprise Grid administration → out of scope

If a Slack app's finding is about secrets or deployment, this Bee surfaces it and names the peer Bee rather than covering it.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- Scenario: new app scaffold, slash command, Block Kit/modal flow, Events API, OAuth install, or Marketplace submission
- Language/runtime (Bolt JS/Python/Java, or a custom HTTP handler)
- Whether the app targets Slack Marketplace distribution (changes the Socket Mode decision)

Ask the Marketplace-distribution and Bolt-vs-custom-handler questions before producing code if they are not stated.

## Outputs the Bee produces

- Bolt SDK code (handlers, Block Kit JSON, modal/view flows) following the ACK-first / dispatch-async pattern
- OAuth multi-workspace `InstallationStore` scaffold
- Events API handler with HMAC-SHA256 verification + `event_id` dedup
- App Directory pre-submission checklist

## Multi-Bee sequences this Bee participates in

- **Slack app close-out** — `slack-app-worker-bee` authors the app; `security-worker-bee` audits token handling and signature verification; `quality-worker-bee` verifies against the plan.
- **Deployment handoff** — `slack-app-worker-bee` builds the app; `devops-worker-bee` wires the deployment pipeline.

## Critical directives the orchestrator should respect

- Acknowledge Slack payloads within 3 seconds, then dispatch async.
- Verify Slack request signatures (HMAC-SHA256) on every non-Bolt handler; missing verification is Critical.
- Never store Slack tokens in plaintext/committed config; route remediation to `security-worker-bee`.
- Never recommend Socket Mode for Marketplace-listed apps.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*
