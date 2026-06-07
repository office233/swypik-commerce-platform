import type { ProcessVideoJobPayload } from "@/lib/video/upload-session";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "video-queue" });

export type QueuePublishResult = {
  queued: boolean;
  backend: "upstash" | "native" | "none";
  messageId?: string;
  error?: string;
};

let warnedAboutRedisUrl = false;

export async function publishProcessVideoJob(
  payload: ProcessVideoJobPayload
): Promise<QueuePublishResult> {
  const queueName = process.env.VIDEO_QUEUE_NAME || process.env.REDIS_STREAM_VIDEO_JOBS || "video:jobs";
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisUrl = process.env.REDIS_URL;

  if (upstashUrl && upstashToken) {
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({ url: upstashUrl, token: upstashToken });
      const messageId = await redis.xadd(queueName, "*", {
        data: JSON.stringify(payload),
      });
      return { queued: true, backend: "upstash", messageId };
    } catch (error) {
      log.error({ err: error }, "Upstash Redis enqueue failed");
      return {
        queued: false,
        backend: "upstash",
        error: error instanceof Error ? error.message : "Redis enqueue failed",
      };
    }
  } else if (redisUrl) {
    try {
      const messageId = await redisXadd(redisUrl, queueName, "data", JSON.stringify(payload));
      return { queued: true, backend: "native", messageId };
    } catch (error) {
      log.error({ err: error }, "Native Redis enqueue failed");
      return {
        queued: false,
        backend: "native",
        error: error instanceof Error ? error.message : "Native Redis enqueue failed",
      };
    }
  }

  if (!warnedAboutRedisUrl) {
    warnedAboutRedisUrl = true;
    log.warn("No Redis configuration found. The DB job remains queued.");
  }
  return { queued: false, backend: "none" };
}

async function redisXadd(rawUrl: string, queueName: string, dataKey: string, dataValue: string): Promise<string> {
  const parsed = new URL(rawUrl);
  const secure = parsed.protocol === "rediss:";
  const host = parsed.hostname || "localhost";
  const port = Number(parsed.port || (secure ? 6380 : 6379));
  const password = decodeURIComponent(parsed.password || "");
  const username = decodeURIComponent(parsed.username || "");
  
  function redisCommand(parts: string[]): string {
    return `*${parts.length}\r\n${parts.map((p) => `$${Buffer.byteLength(p)}\r\n${p}\r\n`).join("")}`;
  }

  const commands = [
    ...(password ? [redisCommand(username ? ["AUTH", username, password] : ["AUTH", password])] : []),
    redisCommand(["XADD", queueName, "*", dataKey, dataValue]),
    redisCommand(["QUIT"])
  ].join("");

  const net = await import("node:net");
  const tls = secure ? await import("node:tls") : null;

  return new Promise<string>((resolve, reject) => {
    const socket = secure ? tls!.connect({ host, port, servername: host }) : net.createConnection({ host, port });
    let buffer = "";
    let settled = false;

    const done = (err?: Error, result?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(result || "");
    };

    const timeout = setTimeout(() => done(new Error("Timeout")), 3000);

    socket.once(secure ? "secureConnect" : "connect", () => socket.write(commands));
    socket.once("error", (err) => { clearTimeout(timeout); done(err); });
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes("-ERR") || buffer.includes("-WRONGTYPE")) {
        clearTimeout(timeout);
        done(new Error(buffer.split("\r\n")[0]));
      } else if (buffer.includes("$") && buffer.includes("\r\n", buffer.indexOf("$"))) {
        clearTimeout(timeout);
        const lines = buffer.split("\r\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("$") && lines[i+1] && lines[i+1].includes("-")) {
            done(undefined, lines[i+1]);
            return;
          }
        }
      }
    });
  });
}
