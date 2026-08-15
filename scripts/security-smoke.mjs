const base = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
let failures = 0;

async function expect(name, path, options, expected) {
  try {
    const response = await fetch(`${base}${path}`, { redirect: "manual", ...options });
    const ok = Array.isArray(expected) ? expected.includes(response.status) : response.status === expected;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${response.status}`);
    if (!ok) failures += 1;
  } catch {
    console.log(`FAIL ${name}: network error`);
    failures += 1;
  }
}

await expect("health endpoint", "/api/health", {}, 200);
await expect("admin namespace fail-closed", "/api/admin/users", {}, 404);
await expect("Mini App without initData", "/api/state", {}, 401);
await expect(
  "forged Mini App initData",
  "/api/state",
  { headers: { "x-telegram-init-data": "auth_date=1&user=%7B%22id%22%3A123%7D&hash=" + "0".repeat(64) } },
  401,
);
await expect(
  "cross-origin mutation",
  "/api/mutate",
  {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    body: JSON.stringify({ entity: "transaction", action: "create", data: { amount: 1 } }),
  },
  403,
);
await expect(
  "oversized mutation",
  "/api/mutate",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(base).origin,
    },
    body: JSON.stringify({
      entity: "transaction",
      action: "create",
      data: { note: "x".repeat(70 * 1024) },
    }),
  },
  413,
);

if (failures) {
  console.error(`${failures} security smoke test(s) failed`);
  process.exit(1);
}
console.log("Security smoke tests passed");
