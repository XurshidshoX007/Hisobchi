# Telegram Image / Document Finance Intelligence

**LOOK → UNDERSTAND → STRUCTURE → CHECK → ASK → SAVE → SYNC.**
Never LOOK → GUESS → SAVE SILENTLY.

This phase is Telegram-bot only. No Mini App UI was added; confirmed data is
written by the **existing shared finance engine** into the **same PostgreSQL
source of truth**, so the Mini App sees it automatically through `/api/state`.

## 1. Pipeline

```
Telegram update (message.photo | message.document with image/* mime)
        ↓  feature flag + per-user rate limit
   file_id → getFile → temporary download (private temp dir, deleted in finally)
        ↓  magic-byte MIME sniff, size cap, no trust in file name
   preprocessing (auto-orientation, resize ≤1600px, contrast, denoise — optional `sharp`)
        ↓
   VisionProvider.readFinancialImage()  → rows of text only
        ↓
   extractFromLines()  → typed entities (deterministic, no model judgement)
        ↓
   validateExtraction() → impossible values rejected before any draft exists
        ↓
   normalizeFinanceData() → drafts shaped for runMutation (categories mapped to
                            the user's EXISTING categories)
        ↓
   pending_drafts (batch)  → Telegram confirmation UX (confirm / edit / cancel)
        ↓
   runMutation (transaction | recurring | expectedIncome | debt)
        ↓
   PostgreSQL → /api/state → Mini App Dashboard / History / Plans / Debts
```

## 2. Files

| File | Role |
| --- | --- |
| `src/lib/imageIntelligence.ts` | Service boundary: `classifyImage`, `extractFinanceData`, `normalizeFinanceData`, `validateExtraction`, `analyzeFinancialImage` |
| `src/lib/image/provider.ts` | `VisionProvider` interface, OpenAI-compatible provider, static test provider, defensive payload parsing |
| `src/lib/image/telegram-file.ts` | getFile → temp download → preprocessing → delete |
| `src/lib/image/file-guards.ts` | Pure guards: magic-byte sniffing, size caps, duplicate fingerprint, photo-size choice |
| `src/lib/image/normalize.ts` | Amount / date / due-day / duration normalization |
| `src/lib/image/extract.ts` | Row grouping, entity building, document classification |
| `src/lib/image/categories.ts` | Centralized category classifier (never creates categories) |
| `src/lib/image/validate.ts` | Validation layer + clarification rules |
| `src/lib/image/ux.ts` | Confirmation message, batch keyboard, item menu, category picker |
| `src/lib/image/draft-edit.ts` | Pure draft blockers + inline edit rules |
| `src/lib/image/pipeline.ts` | Intake orchestration, duplicate claim, draft persistence |
| `src/lib/drafts.ts` | Draft → shared mutation engine routing |

AI code never leaks into the webhook router, the mutation service or the
database layer. Swapping providers means adding one class in `provider.ts`.

## 3. Classification

`PAYMENT_SCHEDULE`, `SHOPPING_LIST`, `EXPENSE_LIST`, `INCOME_LIST`, `DEBT_LIST`,
`CREDITOR_LIST`, `EXPECTED_PAYMENT`, `EXPECTED_INCOME`, `MIXED_FINANCE`,
`UNKNOWN`. A mixed image produces several entity types in one batch; an unknown
image asks the user instead of saving anything.

## 4. Financial semantics

| Image says | Result |
| --- | --- |
| `Bozorlik — 300 000` | real expense → balance decreases after confirmation |
| `17 avgust kredit — 1 880 000` | **plan** (`recurring.create`) → balance unchanged |
| `17 avgust kredit to'landi — 1 880 000` | real expense transaction |
| `20 avgust Avans 3 000 000` | expected income plan, **not** a transaction |
| `Ali — menga 500 000 qarzdor` | debt `owed_to_me` |
| `Vali — men 700 000 berishim kerak` | debt `i_owe` |
| direction unclear | question, never a guess |

## 5. Confidence & clarification

Every field carries a confidence (`amount`, `date`, `type`, `category`,
`person`, `duration`). Below `0.7` the row is marked `❓` and the blocking
issues (`amount_unclear`, `debt_direction_unknown`, invalid date/plan) prevent
the save until the user resolves them inline. Partial extraction is supported:
9 valid rows are confirmable while 1 waits for clarification.

## 6. Categories

Priority: exact user category → semantic match onto an existing user category →
suggestion only → ask. The pipeline **never** creates a category and never
passes `categoryName` into `transaction.create` (which would auto-create one);
it resolves a `categoryId` from the user's own categories or leaves it empty and
offers a picker built exclusively from existing categories.

## 7. Duplicate protection

`image_intakes(user_id, fingerprint)` is unique, where
`fingerprint = sha256(file_unique_id : sha256(content))`. Telegram `update_id`
idempotency (existing) covers retries of the same update; the fingerprint covers
re-sending the same picture later. A failed extraction releases the claim so a
clearer re-send is allowed; a successful one stays idempotent.

## 8. Security & privacy

* temporary processing only — private temp dir, removed in `finally`
* no permanent image storage, no public URL, no image bytes in logs
* audit events carry counts and classification only:
  `image_received`, `image_classified`, `image_extraction_success`,
  `image_extraction_partial`, `image_rejected`, `image_processing_failed`,
  `image_draft_edited`, `confirm_draft`, `confirm_batch`
* declared MIME is never trusted (magic bytes decide); PDF rejected for now
* 5 MB size cap, ≤10 images/minute/user, ≤40 extracted rows per image
* drafts are scoped to `(userId, chatId)`; foreign callbacks are security events

## 9. Activation & rollout

The feature has **two independent gates**, and neither is ever bypassed in
code (no hardcoded `true`, no deleted flag check):

1. `imageIntelligenceEnabled(telegramId)` — the feature flag / test-user list.
2. `visionProviderConfigured()` — an actual vision provider key.

`src/lib/image/access.ts` is the single place that combines them, so the two
failure modes can never be confused:

| Situation | User sees | Audit action |
| --- | --- | --- |
| Flag off, user not allowlisted | "Rasm tahlili hozircha yoqilmagan…" | `image_rejected` |
| Flag on, no `VISION_API_KEY` | "Rasm tahlil xizmati vaqtincha mavjud emas…" | `image_provider_unconfigured` |
| Flag on + provider configured | the analysis result | `image_extraction_success` |

Reporting a missing key as "feature disabled" would hide a production incident
behind a product message, so those messages are deliberately different and a
regression test asserts they never converge.

### Steps

1. `IMAGE_INTELLIGENCE_ENABLED=false` (default) — feature invisible.
2. Set `IMAGE_INTELLIGENCE_TEST_USERS=<your telegram id>` and configure
   `VISION_API_KEY` (+ optional `VISION_BASE_URL` / `VISION_MODEL`).
3. Run the migration `drizzle/0006_image_intelligence.sql`
   (`node scripts/migrate.mjs`, already wired as Railway `preDeployCommand`).
4. Check `GET /api/health` → `imageIntelligence.state == "test-users-only"`
   and `providerConfigured == true`.
5. QA the acceptance list with real photos (shopping list, credit schedule,
   expected income, debt table, mixed image).
6. Flip `IMAGE_INTELLIGENCE_ENABLED=true` for everyone.

## 10. Vision provider & model

The provider speaks the OpenAI-compatible `/chat/completions` dialect, so it
also fits Azure OpenAI, vLLM, Groq and similar gateways.

* `VISION_MODEL` must accept **image input** on `/chat/completions`. The default
  is `gpt-5.4-mini`; verify any override against the provider's current model
  catalogue, since retired or text-only ids make every photo fail.
* Request parameters adapt to the model automatically: GPT-5 / o-series models
  get `max_completion_tokens` (and no `temperature`, which they reject), older
  chat models get `max_tokens` + `temperature: 0`.
* A `400` that names a rejected parameter triggers exactly **one** corrective
  retry, so a stricter gateway self-heals instead of failing the user.

### Failure handling (§25)

A raw provider status, body, model name or key is never shown or logged.

| Provider outcome | User message | Event |
| --- | --- | --- |
| 401 / 403 | "Rasm tahlil xizmati vaqtincha mavjud emas…" | `image_provider_unconfigured` |
| 429 | "Rasm tahliliga vaqtincha navbat ko'p…" | `image_provider_rate_limited` |
| timeout | "Rasmni tahlil qilish uzoq davom etdi…" | `image_processing_failed` |
| 5xx / network | "Rasm tahlil xizmati vaqtincha mavjud emas…" | `image_processing_failed` |
| unreadable / non-JSON | "Rasm sifati past yoki matnni o'qib bo'lmadi." | `image_extraction_failed` |
| no financial rows | "Rasmda moliyaviy ma'lumot topilmadi." | `image_extraction_failed` |

## 11. Tests

| Suite | Needs a database | Covers |
| --- | --- | --- |
| `tests/image-intelligence.test.ts` | no | extraction, normalization, categories, validation, UX |
| `tests/image-activation.test.ts` | no | feature flag, test-user rollout, provider config, request payload, failure mapping, E2E scenarios via `StaticVisionProvider` |
| `tests/image-provider-http.test.ts` | no | real HTTP against a local mock endpoint: success, 401/403/429/5xx, timeout, malformed JSON, retry |
| `tests/image-pipeline-db.test.ts` | **yes** | drafts → confirmation → PostgreSQL, plan vs real balance, duplicates, rate limit, orphan states, Mini App state |

The database suite skips automatically when no database is configured:

```bash
node scripts/migrate.mjs                       # against a throwaway database
TEST_DATABASE_URL=postgresql://... npm run test:db
```

No test ever calls a live vision API — `StaticVisionProvider` and
`FailingVisionProvider` make every path deterministic.
