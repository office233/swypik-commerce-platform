import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { dbQuery } from "@/lib/db";

export type HealthStatus = "ok" | "degraded" | "error";

export interface HealthResult {
  status: HealthStatus;
  latency_ms: number;
  detail: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 2_000;

export async function withLatency<T>(fn: () => Promise<T>): Promise<{ value: T; latency_ms: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, latency_ms: Date.now() - start };
}

export function jsonDetail(error: unknown): Record<string, string> {
  if (error instanceof Error) return { error: error.message };
  return { error: "unknown error" };
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("health check timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkDb(): Promise<HealthResult> {
  try {
    const { latency_ms } = await withLatency(() => withTimeout(dbQuery("SELECT 1"), 1_500));
    return {
      status: latency_ms > 500 ? "degraded" : "ok",
      latency_ms,
      detail: latency_ms > 500 ? { reason: "slow query" } : {},
    };
  } catch (error) {
    return { status: "error", latency_ms: 0, detail: jsonDetail(error) };
  }
}

export async function checkRedis(): Promise<HealthResult> {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { latency_ms } = await withLatency(async () => {
        const { Redis } = await import("@upstash/redis");
        const redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL!,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });
        await withTimeout(redis.ping(), 1_500);
      });
      return { status: "ok", latency_ms, detail: { backend: "upstash" } };
    } catch (error) {
      return { status: "error", latency_ms: 0, detail: { backend: "upstash", ...jsonDetail(error) } };
    }
  }

  if (!process.env.REDIS_URL) {
    return { status: "degraded", latency_ms: 0, detail: { reason: "not_configured" } };
  }

  try {
    const { latency_ms } = await withLatency(() => redisRequest(process.env.REDIS_URL!, [["PING"]], 1_500));
    return { status: "ok", latency_ms, detail: { backend: "native" } };
  } catch (error) {
    return { status: "error", latency_ms: 0, detail: { backend: "native", ...jsonDetail(error) } };
  }
}

export async function checkR2(): Promise<HealthResult> {
  const endpoint = firstEnv("S3_ENDPOINT", "S3_ENDPOINT_URL", "R2_ENDPOINT", "R2_ENDPOINT_URL");
  const accessKeyId = firstEnv("S3_ACCESS_KEY", "S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = firstEnv("S3_SECRET_KEY", "S3_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
  const bucket = firstEnv("S3_BUCKET", "S3_MEDIA_BUCKET", "R2_BUCKET");

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    return { status: "degraded", latency_ms: 0, detail: { reason: "not_configured" } };
  }

  try {
    const client = new S3Client({
      region: firstEnv("S3_REGION", "R2_REGION", "AWS_REGION") || "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });
    const { latency_ms } = await withLatency(() =>
      withTimeout(client.send(new HeadBucketCommand({ Bucket: bucket })), 2_000)
    );
    return { status: "ok", latency_ms, detail: { bucket_configured: true } };
  } catch (error) {
    return { status: "error", latency_ms: 0, detail: jsonDetail(error) };
  }
}

export async function checkQueue(): Promise<HealthResult> {
  const queueName = process.env.VIDEO_QUEUE_NAME || process.env.REDIS_STREAM_VIDEO_JOBS || "video:jobs";
  const failedName = process.env.VIDEO_FAILED_STREAM || `${queueName}:failed`;

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { latency_ms, value } = await withLatency(async () => {
        const { Redis } = await import("@upstash/redis");
        const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
        const [length, failed] = await withTimeout(Promise.all([redis.xlen(queueName), redis.xlen(failedName)]), 1_500);
        return { length: Number(length || 0), failed: Number(failed || 0) };
      });
      return queueResult(value.length, value.failed, latency_ms, queueName, failedName);
    } catch (error) {
      return { status: "error", latency_ms: 0, detail: jsonDetail(error) };
    }
  }

  if (!process.env.REDIS_URL) {
    return { status: "degraded", latency_ms: 0, detail: { reason: "redis_not_configured", queue: queueName } };
  }

  try {
    const { latency_ms, value } = await withLatency(async () => {
      const replies = await redisRequest(process.env.REDIS_URL!, [["XLEN", queueName], ["XLEN", failedName]], 1_500);
      return { length: Number(replies[0] || 0), failed: Number(replies[1] || 0) };
    });
    return queueResult(value.length, value.failed, latency_ms, queueName, failedName);
  } catch (error) {
    return { status: "error", latency_ms: 0, detail: jsonDetail(error) };
  }
}

function queueResult(length: number, failed: number, latency_ms: number, queue: string, failedQueue: string): HealthResult {
  const status: HealthStatus = failed > 100 || length > 10_000 ? "degraded" : "ok";
  return { status, latency_ms, detail: { queue, failed_queue: failedQueue, length, failed } };
}

export async function redisRequest(rawURL: string, commands: string[][], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown[]> {
  const parsed = new URL(rawURL);
  const secure = parsed.protocol === "rediss:";
  if (parsed.protocol !== "redis:" && !secure) throw new Error("unsupported redis URL protocol");

  const host = parsed.hostname || "localhost";
  const port = Number(parsed.port || (secure ? 6380 : 6379));
  const password = decodeURIComponent(parsed.password || "");
  const username = decodeURIComponent(parsed.username || "");
  const auth = password ? [username ? ["AUTH", username, password] : ["AUTH", password]] : [];
  const payload = [...auth, ...commands].map(redisCommand).join("");

  const net = await import("node:net");
  const tls = secure ? await import("node:tls") : null;

  return await new Promise<unknown[]>((resolve, reject) => {
    const socket = secure ? tls!.connect({ host, port, servername: host }) : net.createConnection({ host, port });
    let buffer = "";
    let settled = false;
    const replies: unknown[] = [];
    const expectedReplies = commands.length + auth.length;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      if (err) reject(err);
      else resolve(replies.slice(auth.length));
    };

    const timeout = setTimeout(() => done(new Error("redis command timeout")), timeoutMs);
    socket.once(secure ? "secureConnect" : "connect", () => socket.write(payload));
    socket.once("error", (err) => done(err));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      try {
        const parsedReplies = parseRedisReplies(buffer);
        replies.splice(0, replies.length, ...parsedReplies);
        if (replies.length >= expectedReplies) done();
      } catch (error) {
        done(error as Error);
      }
    });
  });
}

function parseRedisReplies(buffer: string): unknown[] {
  const replies: unknown[] = [];
  let index = 0;
  while (index < buffer.length) {
    const parsed = parseReply(buffer, index);
    if (!parsed) break;
    replies.push(parsed.value);
    index = parsed.next;
  }
  return replies;
}

function parseReply(buffer: string, index: number): { value: unknown; next: number } | null {
  const lineEnd = buffer.indexOf("\r\n", index);
  if (lineEnd === -1) return null;
  const line = buffer.slice(index, lineEnd);
  const type = line[0];
  const data = line.slice(1);
  const next = lineEnd + 2;
  if (type === "+") return { value: data, next };
  if (type === ":") return { value: Number(data), next };
  if (type === "-") throw new Error(data || "redis error");
  if (type === "$") {
    const len = Number(data);
    if (len < 0) return { value: null, next };
    if (buffer.length < next + len + 2) return null;
    return { value: buffer.slice(next, next + len), next: next + len + 2 };
  }
  throw new Error("unsupported redis reply");
}

function redisCommand(parts: string[]): string {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
}

function firstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}
