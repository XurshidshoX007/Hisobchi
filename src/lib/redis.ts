import { createClient, type RedisClientType } from "redis";

const globalRedis = globalThis as typeof globalThis & {
  __pfosRedisClient?: RedisClientType;
  __pfosRedisConnecting?: Promise<RedisClientType | null>;
};

export function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export async function getRedis(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (globalRedis.__pfosRedisClient?.isReady) return globalRedis.__pfosRedisClient;
  if (globalRedis.__pfosRedisConnecting) return globalRedis.__pfosRedisConnecting;

  globalRedis.__pfosRedisConnecting = (async () => {
    const client = createClient({
      url,
      socket: {
        connectTimeout: 5_000,
        reconnectStrategy: (retries) => (retries > 5 ? false : Math.min(100 * 2 ** retries, 2_000)),
      },
    });
    // Do not log error objects: some clients include the connection string.
    client.on("error", () => undefined);
    try {
      await client.connect();
      globalRedis.__pfosRedisClient = client as RedisClientType;
      return client as RedisClientType;
    } catch {
      try {
        await client.disconnect();
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
