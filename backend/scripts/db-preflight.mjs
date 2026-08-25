import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(JSON.stringify({ event: "db_preflight_failed", errorCode: "DATABASE_URL_MISSING" }));
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 5_000,
  ssl:
    process.env.DATABASE_SSL === "true" || process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined,
});

const checks = [
  {
    name: "account_currency_mismatch",
    severity: "critical",
    sql: `select count(*)::int as count
            from accounts a
            join users u on u.id = a.user_id
           where a.currency <> u.currency`,
  },
  {
    name: "transaction_account_currency_mismatch",
    severity: "critical",
    sql: `select count(*)::int as count
            from transactions t
            join accounts source on source.id = t.account_id
       left join accounts target on target.id = t.to_account_id
           where t.is_deleted = false
             and (t.currency <> source.currency
                  or (t.type = 'transfer' and (target.id is null or target.currency <> t.currency)))`,
  },
  {
    name: "duplicate_budget_logical_keys",
    severity: "high",
    sql: `select count(*)::int as count
            from (
              select user_id, coalesce(category_id, -1), month
                from budgets
               where is_deleted = false
            group by user_id, coalesce(category_id, -1), month
              having count(*) > 1
            ) duplicates`,
  },
  {
    name: "duplicate_recurring_occurrences",
    severity: "critical",
    sql: `select count(*)::int as count
            from (
              select user_id, recurring_id, planned_date
                from transactions
               where is_deleted = false
                 and recurring_id is not null
                 and planned_date is not null
            group by user_id, recurring_id, planned_date
              having count(*) > 1
            ) duplicates`,
  },
  {
    name: "duplicate_expected_income_occurrences",
    severity: "critical",
    sql: `select count(*)::int as count
            from (
              select user_id, expected_income_id, planned_date
                from transactions
               where is_deleted = false
                 and expected_income_id is not null
                 and planned_date is not null
            group by user_id, expected_income_id, planned_date
              having count(*) > 1
            ) duplicates`,
  },
  {
    name: "duplicate_credit_installment_numbers",
    severity: "high",
    sql: `select count(*)::int as count
            from (
              select plan_id, occurrence_number
                from credit_installments
            group by plan_id, occurrence_number
              having count(*) > 1
            ) duplicates`,
  },
  {
    name: "incomplete_telegram_user_bootstrap",
    severity: "high",
    sql: `select count(*)::int as count
            from users u
           where u.telegram_id is not null
             and u.is_blocked = false
             and (not exists (select 1 from accounts a where a.user_id = u.id)
                  or not exists (select 1 from categories c where c.user_id = u.id))`,
  },
  {
    name: "stale_processing_drafts",
    severity: "high",
    sql: `select count(*)::int as count
            from pending_drafts
           where status = 'processing'
             and created_at < now() - interval '30 minutes'`,
  },
  {
    name: "expired_processing_idempotency_claims",
    severity: "high",
    sql: `select count(*)::int as count
            from idempotency_keys
           where status = 'processing'
             and expires_at < now()`,
  },
  {
    name: "transaction_category_direction_mismatch",
    severity: "high",
    sql: `select count(*)::int as count
            from transactions t
            join categories c on c.id = t.category_id
           where t.is_deleted = false
             and ((t.type = 'income' and c.type <> 'income')
                  or (t.type = 'expense' and c.type <> 'expense')
                  or t.user_id <> c.user_id)`,
  },
];

let client;
try {
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '15s'");
  await client.query("SET LOCAL lock_timeout = '2s'");

  const results = [];
  for (const check of checks) {
    const result = await client.query(check.sql);
    results.push({
      name: check.name,
      severity: check.severity,
      count: Number(result.rows[0]?.count ?? 0),
    });
  }
  await client.query("COMMIT");

  const findings = results.filter((result) => result.count > 0);
  const status = findings.some((finding) => finding.severity === "critical")
    ? "at_risk"
    : findings.length
      ? "needs_verification"
      : "ok";
  console.log(
    JSON.stringify(
      {
        event: "db_preflight_completed",
        status,
        checks: results,
        // Counts only: never row values, names, Telegram ids, notes or secrets.
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (findings.length) process.exitCode = 2;
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => undefined);
  const code =
    error && typeof error === "object" && "code" in error && /^[A-Za-z0-9_.:-]{1,40}$/.test(String(error.code))
      ? String(error.code)
      : null;
  console.error(
    JSON.stringify({
      event: "db_preflight_failed",
      errorName: error instanceof Error ? error.name : typeof error,
      errorCode: code,
    }),
  );
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
