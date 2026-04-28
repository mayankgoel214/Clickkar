# ADR-0001: Production-Readiness Baseline for the Autmn WhatsApp Backend

**Status:** Proposed
**Date:** 2026-04-20
**Owner:** architect (on behalf of founder)

## Context

Autmn is a WhatsApp-based AI product-photography service: user sends a photo + Rs 99 → AI-generated ad image back on WhatsApp within minutes. The repo at `~/Autmn/` is a Fastify API + BullMQ worker monorepo (pnpm + turbo, 9 packages), explicitly backend-only — there is **no Next.js app, no browser frontend, no Vercel deploy target**. The only HTTP surfaces are webhook endpoints (WhatsApp, Razorpay) and an admin UI at `/admin/*` used for internal testing.

The studio-wide handbook (`~/.claude/CLAUDE.md`) defines a 12-gate Definition of Done and a canonical Next.js + Supabase + Razorpay stack. Several of those gates assume a browser-shipped Next.js product: Lighthouse performance/accessibility/SEO budgets, Vercel preview deploys, `next build`, bundle-size regression diffs. They do not apply to a Fastify webhook service, and forcing them would either produce meaningless green checks or block merges on impossible gates.

At the same time, the founder has asked for the repo to be brought to "industry standard, production quality." A live test on 2026-04-20 revealed four reproducible defects on the per-request hot path. Today there is also zero CI, zero Vitest, zero Playwright, zero pre-commit hook, inconsistent logging patterns, and credentials shared in session transcripts that must be rotated.

We need a shared definition of **what "production ready" means for this specific codebase** — both so P0 work has a target to aim at, and so future agents are not guessing whether a given gate applies.

## Decision

**We adopt a backend-specific Definition of Done that is a subset of the studio DoD, plus two additions, and codify the invariants below as the baseline every PR must preserve.**

### Mandatory DoD gates (enforced via GitHub Actions on every PR)

| # | Gate | Status |
|---|---|---|
| 1 | `pnpm typecheck` (`tsc --noEmit` across all 9 packages) | kept |
| 2 | `pnpm lint` (Biome) | kept |
| 3 | `pnpm test` (Vitest) | kept |
| 4 | `supabase db diff` + migration reversibility check | kept |
| 5 | `gitleaks detect` on diff + full history | kept |
| 6 | Changeset present (or label `no-changelog`) | kept |
| 7 | Playwright smoke (only if `/admin/*` or webhook files touched) | kept |
| 8 | `supabase get_advisors` — RLS + index lint | **added** (replaces Lighthouse a11y) |
| 9 | `turbo build` (full monorepo build succeeds) | kept |

### DoD gates dropped as not-applicable

- `next build` — no Next.js app.
- Vercel preview deploy — backend deploys via its own channel (Railway / Fly / bare node), not Vercel.
- Lighthouse CI (perf ≥ 90, a11y ≥ 95, SEO ≥ 90) — no public web UI.
- Bundle-size regression (≤ 10%) — no browser bundle.

### Mandatory invariants (baseline for this codebase)

These are lifted directly from `CLAUDE.md` "Critical Constraints — NEVER Violate" (§Critical Constraints) and promoted to ADR-level commitment. Any PR that violates one must explicitly call it out in the description and get founder approval.

1. **Idempotency check first.** `checkAndMarkProcessed(messageId)` is the first operation in `handleIncomingMessage`.
2. **200 to Meta within 20s.** Webhook handlers respond before any DB work.
3. **HMAC in production.** `verifyWebhookSignature` must not be bypassed when `NODE_ENV === 'production'`. Startup guard: if `WHATSAPP_APP_SECRET === 'placeholder'` in prod, `process.exit(1)`.
4. **No `PAYMENT_BYPASS` in prod.** Startup guard already enforces this — keep it.
5. **Optimistic lock on order delivery.** `prisma.order.updateMany({ where: { id, status: { in: ['processing','payment_confirmed'] }}})` — return early if `count === 0`.
6. **`transitionTo()` is the only path to change session state.** Never `prisma.session.update({ data: { state }})` from a handler.
7. **CSW `cswExpiresAt` updated on every inbound message.**
8. **Download WhatsApp media immediately.** Media URLs expire in 5min.
9. **`advanceToPayment()` guard intact.** Re-reads session, checks state, sets `earlyPhotoMediaId = 'order_creating'` before Razorpay call.
10. **Bilingual message invariant.** Every user-facing string goes through a `msgX(lang: 'hi' | 'en')` function in `messages.ts`.

### Added invariants specific to this baseline

11. **All secrets are loaded via `apps/<app>/src/config.ts` with Zod validation.** Never `process.env.X` directly in a handler or pipeline file.
12. **Every table in the Prisma schema has an index on columns used in WHERE clauses.** Enforced by `supabase get_advisors` in CI.
13. **Every `UPDATE` on a table has a matching RLS policy or a documented service-role-only justification** (we use Prisma + service role in the backend, but planned Supabase dashboard access must be policy-gated).
14. **Structured JSON logging only.** No free-text `console.log` in production code paths. Pino in API, `console.log(JSON.stringify(...))` in pipeline, shared logger in session handlers.
15. **Every external-service call has an explicit timeout.** No ambient-default `fetch` without `AbortController` + timeout.

## Rationale

**Why a subset of the studio DoD instead of all 12 gates?**
Three of the studio gates (Lighthouse, Vercel preview, bundle size) target a rendered HTML app. Forcing them on a Fastify service would either:
(a) require wrapping the admin UI in Next.js (weeks of work for a single internal tool), or
(b) produce fake-green "N/A" checks that normalize ignoring gates.
Both are worse than explicitly declaring them N/A here.

**Alternatives considered:**

1. *Keep all 12 gates and stub N/A ones.* Rejected — creates a precedent that "check fails but is ignored" is fine.
2. *Write a completely new DoD for every product.* Rejected — too much overhead, loses the studio-wide consistency the handbook is trying to create.
3. *Fork the repo into a new Next.js-fronted product and abandon this codebase.* Rejected in the companion plan — founder's explicit ask was to bring the existing draft 1 to production quality. A fresh repo is a separate track.

**Why add RLS linting (`get_advisors`) as gate 8?**
The studio stack-playbook mandates RLS on every table. Without CI enforcement, it's easy to create a table via Prisma migration and forget to add policies — especially since Prisma doesn't model RLS. Supabase's built-in advisor catches this.

**Why promote the 10 existing critical constraints to invariants rather than trusting CLAUDE.md?**
CLAUDE.md is prose; invariants need to be enforceable. Several of these (idempotency first, optimistic lock) are things only a human reviewer can catch today. Naming them as ADR-level commitments means future agents have a reference to point at during PR review and future changes that violate them trigger explicit ADR supersession.

## Consequences

**Positive:**
- `/build` and `/ship` flows have unambiguous pass/fail criteria for this codebase.
- New agents don't guess about Lighthouse or Vercel preview — the ADR says N/A explicitly.
- Invariants give `code-reviewer` a checklist that's actionable on this specific repo, not generic SaaS advice.
- Credential rotation + gitleaks on every PR closes the current secret-leak risk.
- The 5 added invariants (config.ts, indexes, RLS, logging, timeouts) target the current repo's actual weaknesses, not hypothetical ones.

**Negative:**
- We diverge from the studio stack-playbook. Future Autmn products are assumed to be Next.js + Vercel, so new-product agents must know this product is different.
- Some safety nets from the full DoD (browser perf, SEO meta) are not applicable here, so if we ever add a marketing site for Autmn it will be a separate deployment target under full DoD.
- RLS linting via `get_advisors` requires a Supabase MCP token in CI — adds one secret to manage.
- Structured-logging invariant (#14) requires a sweep through handlers that today use ad-hoc `console.log`.

**Neutral / to watch:**
- If we migrate the admin UI to a Next.js app later (e.g., to build a customer dashboard), some dropped gates come back — supersede this ADR at that point.
- If the founder's fresh repo replaces this codebase before P1 lands, archive this ADR as "accepted but superseded by greenfield" rather than deleting.
- The 40% coverage floor on the Vitest gate is deliberately soft to avoid blocking docs PRs — review at 3 months whether to raise to 60%.

## Rollback plan

**Two-way door.** If any of these gates or invariants turn out to be wrong:

- **DoD gate changes:** simple — amend the GitHub Actions workflow, supersede this ADR with `docs/adr/0002-*`. No data impact.
- **Invariant changes:** more work. Each invariant corresponds to a live guard (startup check, optimistic lock, idempotency table). Removing one means removing the guard and accepting its failure mode. Before removing any invariant, the supersession ADR must (a) document the incident that proved the invariant was wrong, and (b) state which replacement safeguard is now in place.
- **Full reversal:** drop the `docs/adr/` directory and fall back to only `CLAUDE.md` as the spec. Low cost (nothing else depends on this ADR), but loses the durable reference future agents will use.

Reversal cost: roughly 1 day of founder time to supersede. No production data migrations required. No external-service reconfigurations required.
