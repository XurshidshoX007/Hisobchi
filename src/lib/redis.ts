import { createClient, type RedisClientType } from "redis";

const globalRedis = globalThis as typeof globalThis & {
  __pfosRedisClient?: RedisClientType;
  __pfosRedisConnecting?: Promise<RedisClientType | null>;
  __pfosRedisRetryAfter?: number;
};

export function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export async function getRedis(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const existing = globalRedis.__pfosRedisClient;
  if (existing?.isReady) return existing;
  // A connected client may be in its own bounded reconnect cycle. Do not spawn
  // another socket for every request while that cycle is in progress.
  if (existing?.isOpen) return null;
  if (existing && !existing.isOpen) globalRedis.__pfosRedisClient = undefined;
  if (globalRedis.__pfosRedisConnecting) return globalRedis.__pfosRedisConnecting;
  if ((globalRedis.__pfosRedisRetryAfter ?? 0) > Date.now()) return null;

  globalRedis.__pfosRedisConnecting = (async () => {
    const client = createClient({
      url,
      // Never queue security/rate-limit commands behind a disconnected socket.
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 1_500,
        reconnectStrategy: (retries) => (retries > 1 ? false : Math.min(100 * 2 ** retries, 500)),
      },
    });
    // Do not log error objects: some clients include the connection string.
    client.on("error", () => undefined);
    try {
      await client.connect();
      globalRedis.__pfosRedisRetryAfter = 0;
      globalRedis.__pfosRedisClient = client as RedisClientType;
      return client as RedisClientType;
    } catch {
      // Circuit-break repeated request-path connection attempts during an
      // outage; callers immediately use their documented safe fallback.
      globalRedis.__pfosRedisRetryAfter = Date.now() + 5_000;
      try {
        if (client.isOpen) await client.disconnect();
      } catch {
        /* noop */
      }
      return null;
    } finally {
      globalRedis.__pfosRedisConnecting = undefined;
    }
  })();

  return globalRedis.__pfosRedisConnecting;
}

export async function redisHealth(): Promise<"connected" | "unset" | "error"> {
  if (!redisConfigured()) return "unset";
  const client = await getRedis();
  if (!client) return "error";
  try {
    return (await client.ping()) === "PONG" ? "connected" : "error";
  } catch {
    return "error";
  }
}
