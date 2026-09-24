import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { one, run, transaction } from "./db";
import {
  authenticate,
  clearCookie,
  createSession,
  login,
  rateLimit,
  register,
  revoke,
} from "./auth";
import {
  ApiError,
  channelSchema,
  emojiSchema,
  loginSchema,
  messageSchema,
  migrationSchema,
  registerSchema,
  settingsSchema,
} from "./validation";
import {
  attachment,
  clearHistory,
  createChannel,
  deleteAccount,
  getState,
  inviteMember,
  markRead,
  membership,
  migrateLegacy,
  now,
  react,
  requireMember,
  sendMessage,
  startDirect,
  updateSettings,
} from "./service";
import { seedDemo } from "./seed";

function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
async function bytes(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") || 0) > limit)
    throw new ApiError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function body(request: Request, limit = 3_000_000) {
  if (!(request.headers.get("content-type") || "").includes("application/json"))
    throw new ApiError(415, "Send application/json.");
  try {
    return JSON.parse(new TextDecoder().decode(await bytes(request, limit)));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid JSON request body.");
  }
}
function checkOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (
    (origin && origin !== expected) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new ApiError(403, "Cross-origin requests are not allowed.");
}
const contactSchema = z
  .object({ contactId: z.string().min(1).max(200) })
  .strict();
const membershipSchema = z.object({ joined: z.boolean() }).strict();

export async function handleApi(
  request: Request,
  segments: string[],
): Promise<Response> {
  try {
    checkOrigin(request);
    const path = segments.join("/"),
      method = request.method;
    if (path === "health" && method === "GET") {
      one("SELECT 1");
      return json({ ok: true });
    }
    if (path === "auth/options" && method === "GET")
      return json({ demoEnabled: demoEnabled() });
    if (segments[0] === "auth" && method === "POST") {
      if (path === "auth/logout") {
        revoke(request);
        return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
      }
      rateLimit("auth:global", 100, 60_000);
      let userId: string;
      if (path === "auth/register") {
        const input = registerSchema.parse(await body(request, 10000));
        rateLimit(`auth:${input.email}`, 10, 60_000);
        userId = await register(input);
      } else if (path === "auth/login") {
        const input = loginSchema.parse(await body(request, 10000));
        rateLimit(`auth:${input.email}`, 10, 60_000);
        userId = await login(input.email, input.password);
      } else if (path === "auth/demo") {
        if (!demoEnabled())
          throw new ApiError(403, "Demo login is disabled on this server.");
        seedDemo();
        if (!one("SELECT 1 FROM users WHERE id='user-me'"))
          throw new ApiError(
            410,
            "The demo account was deleted. Register a new account.",
          );
        userId = "user-me";
      } else throw new ApiError(404, "API endpoint not found.");
      return json(getState(userId), path === "auth/register" ? 201 : 200, {
        "Set-Cookie": createSession(userId, request),
      });
    }
    const user = authenticate(request),
      uid = user.id;
    if (method !== "GET") rateLimit(`write:${uid}`, 180, 60_000);
    if (path === "state" && method === "GET") return json(getState(uid));
    if (path === "conversations" && method === "POST") {
      const input = contactSchema.parse(await body(request));
      const conversationId = startDirect(uid, input.contactId);
      return json({ conversationId, state: getState(uid) }, 201);
    }
    if (path === "channels" && method === "POST") {
      const id = createChannel(uid, channelSchema.parse(await body(request)));
      const state = getState(uid);
      return json(
        { channel: state.channels.find((c) => c.id === id), state },
        201,
      );
    }
    if (segments[0] === "channels" && segments.length === 3) {
      const id = segments[1];
      if (segments[2] === "membership" && method === "PUT") {
        membership(uid, id, membershipSchema.parse(await body(request)).joined);
        return json(getState(uid));
      }
      if (segments[2] === "open" && method === "POST") {
        requireMember(uid, id);
        if (!one("SELECT 1 FROM channels WHERE id=?", id))
          throw new ApiError(404, "Channel not found.");
        markRead(uid, id);
        return json({ conversationId: id, state: getState(uid) });
      }
      if (segments[2] === "members" && method === "POST") {
        inviteMember(
          uid,
          id,
          contactSchema.parse(await body(request)).contactId,
        );
        return json(getState(uid));
      }
    }
    if (segments[0] === "conversations") {
      const id = segments[1];
      if (
        segments.length === 3 &&
        segments[2] === "preferences" &&
        method === "PATCH"
      ) {
        requireMember(uid, id);
        const { muted } = z
          .object({ muted: z.boolean() })
          .strict()
          .parse(await body(request));
        run(
          "UPDATE members SET muted=? WHERE conversation_id=? AND user_id=?",
          Number(muted),
          id,
          uid,
        );
        return json(getState(uid));
      }
      if (
        segments.length === 3 &&
        segments[2] === "messages" &&
        method === "POST"
      ) {
        sendMessage(uid, id, messageSchema.parse(await body(request)));
        return json(getState(uid), 201);
      }
      if (segments.length === 3 && segments[2] === "read" && method === "PUT") {
        markRead(uid, id);
        return json(getState(uid));
      }
      if (
        segments.length === 5 &&
        segments[2] === "messages" &&
        segments[4] === "reactions" &&
        method === "POST"
      ) {
        react(
          uid,
          id,
          segments[3],
          emojiSchema.parse(await body(request)).emoji,
        );
        return json(getState(uid));
      }
    }
    if (path === "settings" && method === "PATCH") {
      updateSettings(uid, settingsSchema.parse(await body(request)));
      return json(getState(uid));
    }
    if (segments[0] === "blocked" && segments.length === 2) {
      if (method === "DELETE") {
        run(
          "DELETE FROM blocked_users WHERE user_id=? AND blocked_id=?",
          uid,
          segments[1],
        );
        return json(getState(uid));
      }
      if (method === "PUT") {
        if (
          uid === segments[1] ||
          !one("SELECT id FROM users WHERE id=?", segments[1])
        )
          throw new ApiError(400, "Invalid contact.");
        run(
          "INSERT OR IGNORE INTO blocked_users VALUES (?,?,?)",
          uid,
          segments[1],
          now(),
        );
        return json(getState(uid));
      }
    }
    if (path === "history" && method === "DELETE") {
      clearHistory(uid);
      return json(getState(uid));
    }
    if (path === "account" && method === "DELETE") {
      deleteAccount(uid);
      return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
    }
    if (path === "migrate" && method === "GET") {
      const backup = one<{ payload: string }>(
        "SELECT payload FROM legacy_imports WHERE user_id=?",
        uid,
      );
      if (!backup)
        throw new ApiError(404, "No browser import exists for this account.");
      return json(JSON.parse(backup.payload), 200, {
        "Content-Disposition":
          'attachment; filename="chatflow-browser-backup.json"',
      });
    }
    if (path === "migrate" && method === "POST") {
      migrateLegacy(
        uid,
        migrationSchema.parse(await body(request, 16 * 1024 * 1024)),
      );
      return json(getState(uid));
    }
    if (path === "uploads" && method === "POST") {
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.startsWith("multipart/form-data"))
        throw new ApiError(415, "Upload a multipart form with a file field.");
      const raw = await bytes(request, 11 * 1024 * 1024);
      let form: FormData;
      try {
        form = await new Response(raw as BodyInit, {
          headers: { "Content-Type": contentType },
        }).formData();
      } catch {
        throw new ApiError(400, "Invalid multipart upload.");
      }
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0)
        throw new ApiError(400, "Choose a non-empty file.");
      if (file.size > 10 * 1024 * 1024)
        throw new ApiError(413, "Files must be 10 MB or smaller.");
      const id = randomUUID(),
        name =
          file.name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 255) ||
          "attachment";
      const mime = file.type || "application/octet-stream";
      const kind = /^image\/(png|jpeg|gif|webp|avif)$/.test(mime)
        ? "image"
        : mime === "application/pdf"
          ? "pdf"
          : "doc";
      const contents = new Uint8Array(await file.arrayBuffer());
      transaction(() => {
        const used = Number(
          one(
            "SELECT COALESCE(SUM(size),0) AS n FROM uploads WHERE owner_id=?",
            uid,
          )?.n,
        );
        if (used + file.size > 100 * 1024 * 1024)
          throw new ApiError(413, "Your 100 MB upload quota is full.");
        run(
          "INSERT INTO uploads VALUES (?,?,?,?,?,?,?,?)",
          id,
          uid,
          name,
          mime,
          file.size,
          kind,
          contents,
          now(),
        );
      });
      return json(attachment({ id, name, size: file.size, kind }), 201);
    }
    if (
      segments[0] === "uploads" &&
      segments.length === 2 &&
      method === "GET"
    ) {
      const id = segments[1];
      const upload = one<{
        id: string;
        owner_id: string;
        name: string;
        mime: string;
        bytes: Uint8Array;
        size: number;
      }>("SELECT * FROM uploads WHERE id=?", id);
      if (!upload) throw new ApiError(404, "File not found.");
      if (
        upload.owner_id !== uid &&
        !one(
          `SELECT 1 FROM attachments a JOIN messages msg ON msg.id=a.message_id JOIN members m ON m.conversation_id=msg.conversation_id WHERE a.upload_id=? AND m.user_id=? AND msg.seq>m.cleared_seq`,
          id,
          uid,
        )
      )
        throw new ApiError(404, "File not found or access denied.");
      return new Response(upload.bytes as BodyInit, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(upload.size),
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(upload.name)}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
    throw new ApiError(404, "API endpoint not found.");
  } catch (error) {
    if (error instanceof ApiError)
      return json(
        { error: error.message },
        error.status,
        error.status === 429 ? { "Retry-After": "60" } : {},
      );
    if (error instanceof ZodError)
      return json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".") || "Request"}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    console.error("ChatFlow API error:", error);
    return json(
      { error: "An unexpected server error occurred. Please retry." },
      500,
    );
  }
}
function demoEnabled() {
  return (
    process.env.CHATFLOW_DEMO === "true" ||
    (process.env.CHATFLOW_DEMO !== "false" &&
      process.env.NODE_ENV !== "production")
  );
}
