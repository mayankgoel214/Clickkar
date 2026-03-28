import IORedis from "ioredis";

function createRedisConnection(): IORedis {
  const redisUrl = process.env["REDIS_URL"];

  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is not set");
  }

  const isTls = redisUrl.startsWith("rediss://");

  const connection = new IORedis(redisUrl, {
    // Required for BullMQ — must be null, not a finite number
    maxRetriesPerRequest: null,
    // Enable TLS for Upstash and other rediss:// endpoints
    tls: isTls ? {} : undefined,
    // Reconnect with exponential backoff, max 3s
    retryStrategy(times) {
      return Math.min(times * 200, 3000);
    },
    enableReadyCheck: false,
    lazyConnect: false,
  });

  connection.on("error", (err: Error) => {
    // Structured log — avoid console.log in production code
    process.stderr.write(
      JSON.stringify({
        level: "error",
        msg: "Redis connection error",
        error: err.message,
        stack: err.stack,
        ts: new Date().toISOString(),
      }) + "\n"
    );
  });

  return connection;
}

let _connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!_connection) {
    _connection = createRedisConnection();
  }
  return _connection;
}
