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

## 9. Rollout

1. `IMAGE_INTELLIGENCE_ENABLED=false` (default) — feature invisible.
2. Set `IMAGE_INTELLIGENCE_TEST_USERS=<your telegram id>` and configure
   `VISION_API_KEY` / `VISION_MODEL`.
3. Run the migration `drizzle/0006_image_intelligence.sql`
   (`node scripts/migrate.mjs`, already wired as Railway `preDeployCommand`).
4. QA the acceptance list with real photos (shopping list, credit schedule,
   expected income, debt table, mixed image).
5. Flip `IMAGE_INTELLIGENCE_ENABLED=true` for everyone.

Without a provider key the bot degrades gracefully: the user gets the
"send a clearer photo or type the amounts" fallback, never a raw AI error.
