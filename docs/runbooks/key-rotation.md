# Key Rotation Runbook

For rotating API keys across the four AI providers Autmn uses: Gemini, fal.ai, Groq, Sarvam. The `@autmn/keypool` package makes this zero-downtime: keys are multi-valued, health-aware, and rotated round-robin.

---

## When to rotate

- **Compromise:** a key leaked, was committed to git, or showed up in logs. Rotate immediately.
- **429 spike:** `/admin/keypool` shows a key with `failureCount` climbing and repeated `rate_limited` reasons. Add a second key to ease the pressure; don't necessarily rotate.
- **Scheduled rotation:** every 90 days by default. Set a calendar reminder.
- **Provider rotation reminder:** Google/Razorpay sometimes email you to rotate. Treat as scheduled.
- **Auth error on boot:** `/admin/keypool` shows a key permanently in cool-down with `lastFailureReason: auth_error`. Key has been revoked upstream — rotate now.

---

## Environment variables per provider

Both shapes are supported: comma-separated plural (new) or single (backwards compat). Pool prefers plural.

| Provider | Plural (preferred) | Singular (fallback) | Alt singular |
|---|---|---|---|
| Gemini | `GOOGLE_AI_API_KEYS` | `GOOGLE_AI_API_KEY` | `GOOGLE_GENAI_API_KEY` |
| fal.ai | `FAL_KEYS` | `FAL_KEY` | `FAL_API_KEY` |
| Groq | `GROQ_API_KEYS` | `GROQ_API_KEY` | — |
| Sarvam | `SARVAM_API_KEYS` | `SARVAM_API_KEY` | — |

Example:
```
GOOGLE_AI_API_KEYS=AIzaSy-old-key,AIzaSy-new-key
```

---

## Zero-downtime rotation procedure

The pool rotates round-robin across healthy keys. Never leave the pool empty during a rotation.

1. **Create the new key** in the provider console (console.cloud.google.com, fal.ai/dashboard, console.groq.com, dashboard.sarvam.ai).
2. **Append** it to the env var, keeping the old key in place:
   ```
   GOOGLE_AI_API_KEYS=AIzaSy-old-key,AIzaSy-new-key
   ```
3. **Deploy.** Both API and worker processes reload the pool at boot. A boot-summary event is logged: `{"event":"keypool.boot_summary","providers":{"gemini":2,...}}`
4. **Verify the new key is in rotation.** After ~30 seconds of real traffic, check:
   ```bash
   curl -H "x-admin-secret: $ADMIN_SECRET" https://<api-host>/admin/keypool | jq '.gemini.keys'
   ```
   Both keys should show `successCount > 0` and `healthy: true`.
5. **Remove the old key** from the env var:
   ```
   GOOGLE_AI_API_KEYS=AIzaSy-new-key
   ```
6. **Deploy.** Boot summary now shows count of 1 for that provider.
7. **Revoke the old key** in the provider console. This is the point of no return — don't skip it, a leaked-but-unrevoked key is still dangerous.

---

## In-flight requests during rotation

- Requests holding an already-acquired key complete normally against whatever was in the pool when they acquired.
- Requests that start after redeploy use the new pool. The singleton is recreated on process start, not on SIGHUP.
- If the revoked key is still being called during the brief overlap, the provider returns 401/403 — the pool auto-classifies as `auth_error` and moves to indefinite cool-down. The retry in `keypool.call()` lands on the next healthy key. End-user impact: zero.

---

## Emergency: compromised key

1. Revoke in the provider console **first** (don't wait for redeploy).
2. Calls in flight against the revoked key fail with 401/403; pool rotates to siblings.
3. If the provider has only one key in the pool, pipeline will throw `KeyPoolExhaustedError`. User-facing fallback: the never-fail pipeline's lower tiers (Tier 2 styled studio, Tier 3 clean studio, Tier 4 enhanced original) do not use Gemini/fal — user still gets an output.
4. Add a new key, remove the revoked key, redeploy.

---

## Observability

- **Health endpoint:** `GET /admin/keypool` returns per-provider totals + per-key `{hint, healthy, coolDownUntil, successCount, failureCount, lastFailureAt, lastFailureReason}`. Keys are always masked.
- **Manual revive** (for auth-errored keys that were a transient console glitch): `POST /admin/keypool/revive` with body `{"provider":"gemini","hint":"AIz...xyz"}`. Do not use this to paper over a real revoke — only when you've confirmed the key is valid upstream.
- **Structured logs:** boot summary, per-key health transitions, pool exhaustions. Search `event` prefix `keypool.`.

---

## Budget / security reminders

- Never commit `.env` or any file containing a raw key. Gitleaks in CI must catch this; the `@autmn/keypool` package never logs the key itself.
- Free-tier keys are fine in pools — cost-aware rotation is a future upgrade; today all keys are treated equal.
- Rotate after any employee offboarding or if a keyfile left a laptop.
