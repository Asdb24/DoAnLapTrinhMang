import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db";
import {
  ApiError,
  settingsSchema,
  channelSchema,
  messageSchema,
  migrationSchema,
} from "./validation";
import type {
  Conversation,
  MessageType,
  UserSettings,
  Channel,
  Contact,
  BlockedUser,
  MessageAttachment,
  SharedMediaItem,
} from "../types";
import { z } from "zod";

export type User = {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string;
  avatar: string;
  role: string;
  bio: string;
  status_message: string;
  presence: "online" | "away" | "offline";
  migration_completed: number;
  is_demo: number;
};
type Member = { read_seq: number; cleared_seq: number; muted: number };
type Conv = {
  id: string;
  name: string;
  type: "direct" | "group";
  description: string;
  created_by: string | null;
  archived_import: number;
};
type Msg = {
  id: string;
  seq: number;
  sender_id: string | null;
  sender_name: string;
  content: string;
  created_at: string;
  legacy_date: string | null;
  legacy_time: string | null;
  legacy_payload: string | null;
  avatar: string | null;
  display_name: string | null;
};
const historicalFiles = z
  .array(
    z.object({
      name: z.string().max(255),
      size: z.string().max(40),
      type: z.enum(["image", "doc", "pdf"]),
      url: z.string().max(3000).optional(),
    }),
  )
  .max(100);
function importedAttachments(payload: string | null): MessageAttachment[] {
  if (!payload) return [];
  const data = historicalFiles.safeParse(JSON.parse(payload).attachments);
  // Old file pickers saved names, not bytes. Display metadata, never manufacture downloads.
  return data.success
    ? data.data.map((a) => ({
        ...a,
        url: a.url && /^https?:\/\//i.test(a.url) ? a.url : undefined,
      }))
    : [];
}
function sharedItems(message: MessageType): SharedMediaItem[] {
  const files: SharedMediaItem[] = (message.attachments || []).map((a, i) => ({
    id: `${message.id}-${i}`,
    name: a.name,
    type: a.type === "image" ? "image" : "file",
    size: a.size,
    url: a.url,
    date: message.date,
  }));
  const urls = message.content.match(/https?:\/\/[^\s<>"']+/gi) || [];
  for (const [index, match] of urls.entries()) {
    try {
      const url = new URL(match.replace(/[.,;!?)}\]]+$/g, "")).href;
      files.push({
        id: `${message.id}-link-${index}`,
        name: url,
        type: "link",
        url,
        date: message.date,
      });
    } catch {
      /* Ignore incomplete URLs while keeping the original message text. */
    }
  }
  return files;
}
export const now = () => new Date().toISOString();
export function getUser(id: string) {
  const user = one<User>("SELECT * FROM users WHERE id=?", id);
  if (!user) throw new ApiError(401, "Please sign in again.");
  return user;
}
export function requireMember(userId: string, conversationId: string) {
  const member = one<Member>(
    "SELECT * FROM members WHERE conversation_id=? AND user_id=?",
    conversationId,
    userId,
  );
  if (!member)
    throw new ApiError(404, "Conversation not found or access denied.");
  return member;
}
function maxSeq(conversationId?: string) {
  return Number(
    (conversationId
      ? one(
          "SELECT COALESCE(MAX(seq),0) AS n FROM messages WHERE conversation_id=?",
          conversationId,
        )
      : one("SELECT COALESCE(MAX(seq),0) AS n FROM messages")
    )?.n || 0,
  );
}
function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function day(iso: string) {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? "Today"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}
export function attachment(upload: {
  id: string;
  name: string;
  size: number;
  kind: "image" | "doc" | "pdf";
}): MessageAttachment {
  return {
    name: upload.name,
    size:
      upload.size < 1024 * 1024
        ? `${(upload.size / 1024).toFixed(1)} KB`
        : `${(upload.size / 1024 / 1024).toFixed(1)} MB`,
    type: upload.kind,
    url: `/api/uploads/${upload.id}`,
  };
}
export function getSettings(user: User): UserSettings {
  const pref = one("SELECT * FROM settings WHERE user_id=?", user.id)!;
  return {
    theme: pref.theme as UserSettings["theme"],
    density: pref.density as UserSettings["density"],
    enterToSend: !!pref.enter_to_send,
    desktopNotifications: !!pref.desktop_notifications,
    soundNotifications: !!pref.sound_notifications,
    displayName: user.display_name,
    statusMessage: user.status_message,
    avatar: user.avatar,
    email: user.email,
    role: user.role,
    presence: user.presence,
  };
}
export function getState(userId: string) {
  const user = getUser(userId);
  const conversations: Conversation[] = all<Conv & Member>(
    `SELECT c.*,m.read_seq,m.cleared_seq,m.muted FROM conversations c JOIN members m ON m.conversation_id=c.id WHERE m.user_id=? ORDER BY COALESCE((SELECT MAX(seq) FROM messages WHERE conversation_id=c.id),0) DESC,c.created_at DESC`,
    userId,
  ).map((c) => {
    const other =
      c.type === "direct"
        ? one<User>(
            "SELECT u.* FROM users u JOIN members m ON m.user_id=u.id WHERE m.conversation_id=? AND u.id<>? LIMIT 1",
            c.id,
            userId,
          )
        : undefined;
    const rows = all<Msg>(
      "SELECT m.*,u.avatar,u.display_name FROM messages m LEFT JOIN users u ON m.sender_id=u.id WHERE m.conversation_id=? AND m.seq>? ORDER BY m.seq",
      c.id,
      c.cleared_seq,
    );
    const peerReads = all<{ read_seq: number }>(
      "SELECT read_seq FROM members WHERE conversation_id=? AND user_id<>?",
      c.id,
      userId,
    );
    const messages: MessageType[] = rows.map((m) => {
      const attachments = [
        ...all<{
          id: string;
          name: string;
          size: number;
          kind: "image" | "doc" | "pdf";
        }>(
          "SELECT u.id,u.name,u.size,u.kind FROM uploads u JOIN attachments a ON a.upload_id=u.id WHERE a.message_id=?",
          m.id,
        ).map(attachment),
        ...importedAttachments(m.legacy_payload),
      ];
      return {
        id: m.id,
        senderId: m.sender_id || "imported",
        senderName: m.display_name || m.sender_name,
        senderAvatar: m.avatar || undefined,
        content: m.content,
        timestamp: m.legacy_time || clock(m.created_at),
        date: c.archived_import ? m.legacy_date || day(m.created_at) : day(m.created_at),
        isSentByMe: m.sender_id === userId,
        status:
          m.sender_id === userId
            ? peerReads.length > 0 &&
              peerReads.every((p) => p.read_seq >= m.seq)
              ? "read"
              : "sent"
            : m.seq <= c.read_seq
              ? "read"
              : "delivered",
        attachments,
        reactions: all<{ emoji: string; count: number; mine: number }>(
          "SELECT emoji,COUNT(*) AS count,MAX(CASE WHEN user_id=? THEN 1 ELSE 0 END) AS mine FROM reactions WHERE message_id=? GROUP BY emoji",
          userId,
          m.id,
        ).map((r) => ({
          emoji: r.emoji,
          count: r.count,
          reactedByMe: !!r.mine,
        })),
      };
    });
    const last = messages.at(-1);
    return {
      id: c.id,
      isMuted: !!c.muted,
      isArchived: !!c.archived_import,
      name: other?.display_name || c.name,
      type: c.type,
      avatar: other?.avatar || "",
      presence: other?.presence,
      description: other?.bio || c.description,
      membersCount: Number(
        one("SELECT COUNT(*) AS n FROM members WHERE conversation_id=?", c.id)
          ?.n,
      ),
      lastMessage: last
        ? last.content || "Sent an attachment"
        : c.cleared_seq
          ? "Chat history cleared"
          : "No messages yet",
      lastMessageTime: last?.timestamp || "",
      unreadCount: rows.filter(
        (m) => m.sender_id !== userId && m.seq > c.read_seq,
      ).length,
      messages,
      sharedMedia: messages.flatMap(sharedItems),
    };
  });
  const channels: Channel[] = all<{
    id: string;
    name: string;
    description: string;
    category: Channel["category"];
    is_private: number;
    owner_id: string | null;
    joined: number;
    count: number;
  }>(
    `SELECT ch.*,EXISTS(SELECT 1 FROM members m WHERE m.conversation_id=ch.id AND m.user_id=?) AS joined,(SELECT COUNT(*) FROM members m WHERE m.conversation_id=ch.id) AS count FROM channels ch WHERE ch.is_private=0 OR EXISTS(SELECT 1 FROM members m WHERE m.conversation_id=ch.id AND m.user_id=?) ORDER BY ch.name`,
    userId,
    userId,
  ).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    category: c.category,
    isPrivate: !!c.is_private,
    isJoined: !!c.joined,
    isOwner: c.owner_id === userId,
    subscriberCount: c.count,
  }));
  const contacts: Contact[] = all<User>(
    "SELECT * FROM users WHERE id<>? AND id NOT IN (SELECT blocked_id FROM blocked_users WHERE user_id=?) ORDER BY display_name",
    userId,
    userId,
  ).map((u) => ({
    id: u.id,
    name: u.display_name,
    role: u.role,
    email: u.email,
    presence: u.presence,
    avatar: u.avatar,
    bio: u.bio,
    customStatus: u.status_message,
    conversationId: one<{ id: string }>(
      "SELECT id FROM conversations WHERE direct_key=?",
      directKey(userId, u.id),
    )?.id,
  }));
  const blockedUsers: BlockedUser[] = all<User & { blocked_at: string }>(
    "SELECT u.*,b.created_at AS blocked_at FROM blocked_users b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=?",
    userId,
  ).map((u) => ({
    id: u.id,
    name: u.display_name,
    handle: u.email,
    avatar: u.avatar,
    blockedDate: day(u.blocked_at),
  }));
  return {
    currentUser: { id: user.id, email: user.email },
    conversations,
    channels,
    contacts,
    settings: getSettings(user),
    blockedUsers,
    migrationCompleted: !!user.migration_completed,
  };
}
const directKey = (a: string, b: string) => [a, b].sort().join(":");
export function startDirect(userId: string, contactId: string) {
  if (
    contactId === userId ||
    !one("SELECT id FROM users WHERE id=?", contactId)
  )
    throw new ApiError(404, "Contact not found.");
  if (
    one(
      "SELECT 1 FROM blocked_users WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)",
      userId,
      contactId,
      contactId,
      userId,
    )
  )
    throw new ApiError(403, "Messaging this contact is blocked.");
  return transaction(() => {
    const key = directKey(userId, contactId);
    const existing = one<{ id: string }>(
      "SELECT id FROM conversations WHERE direct_key=?",
      key,
    );
    if (existing) return existing.id;
    const id = randomUUID();
    run(
      "INSERT INTO conversations (id,name,type,direct_key,created_by,created_at) VALUES (?,?,?,?,?,?)",
      id,
      "Direct message",
      "direct",
      key,
      userId,
      now(),
    );
    run(
      "INSERT INTO members (conversation_id,user_id) VALUES (?,?),(?,?)",
      id,
      userId,
      id,
      contactId,
    );
    return id;
  });
}
export function createChannel(
  userId: string,
  input: z.infer<typeof channelSchema>,
) {
  return transaction(() => {
    if (one("SELECT id FROM channels WHERE name=?", input.name))
      throw new ApiError(409, "A channel with this name already exists.");
    const id = randomUUID();
    run(
      "INSERT INTO conversations (id,name,type,description,created_by,created_at) VALUES (?,?,?,?,?,?)",
      id,
      `#${input.name}`,
      "group",
      input.description,
      userId,
      now(),
    );
    run(
      "INSERT INTO channels VALUES (?,?,?,?,?,?)",
      id,
      input.name,
      input.description,
      input.category,
      Number(input.isPrivate),
      userId,
    );
    run(
      "INSERT INTO members (conversation_id,user_id) VALUES (?,?)",
      id,
      userId,
    );
    return id;
  });
}
export function membership(userId: string, id: string, joined: boolean) {
  transaction(() => {
    const channel = one<{ is_private: number; owner_id: string | null }>(
      "SELECT * FROM channels WHERE id=?",
      id,
    );
    const member = one(
      "SELECT 1 FROM members WHERE user_id=? AND conversation_id=?",
      userId,
      id,
    );
    if (!channel || (channel.is_private && !member))
      throw new ApiError(404, "Channel not found or invitation required.");
    if (joined)
      run(
        "INSERT OR IGNORE INTO members (conversation_id,user_id,read_seq) VALUES (?,?,?)",
        id,
        userId,
        maxSeq(id),
      );
    else {
      if (channel.owner_id === userId)
        throw new ApiError(
          409,
          "The channel owner cannot leave their channel.",
        );
      run(
        "DELETE FROM members WHERE conversation_id=? AND user_id=?",
        id,
        userId,
      );
    }
  });
}
export function inviteMember(userId: string, id: string, contactId: string) {
  if (!one("SELECT 1 FROM channels WHERE id=? AND owner_id=?", id, userId))
    throw new ApiError(403, "Only the channel owner can invite members.");
  if (!one("SELECT 1 FROM users WHERE id=?", contactId))
    throw new ApiError(404, "Contact not found.");
  run(
    "INSERT OR IGNORE INTO members (conversation_id,user_id,read_seq) VALUES (?,?,?)",
    id,
    contactId,
    maxSeq(id),
  );
}
export function sendMessage(
  userId: string,
  id: string,
  input: z.infer<typeof messageSchema>,
) {
  transaction(() => {
    requireMember(userId, id);
    if (one("SELECT 1 FROM conversations WHERE id=? AND archived_import=1", id))
      throw new ApiError(
        409,
        "Imported history is read-only. Start a new conversation with the contact to send messages.",
      );
    const peer = one<{ user_id: string }>(
      "SELECT m.user_id FROM members m JOIN conversations c ON c.id=m.conversation_id WHERE c.id=? AND c.type='direct' AND m.user_id<>?",
      id,
      userId,
    );
    if (
      peer &&
      one(
        "SELECT 1 FROM blocked_users WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)",
        userId,
        peer.user_id,
        peer.user_id,
        userId,
      )
    )
      throw new ApiError(403, "Messaging this contact is blocked.");
    const uploads = [
      ...new Set(
        (input.attachments || []).map((a) => a.url.split("/").at(-1)!),
      ),
    ];
    for (const upload of uploads)
      if (
        !one("SELECT 1 FROM uploads WHERE id=? AND owner_id=?", upload, userId)
      )
        throw new ApiError(
          400,
          "Attachment is missing or not owned by you. Upload it again.",
        );
    const user = getUser(userId),
      messageId = randomUUID();
    run(
      "INSERT INTO messages (id,conversation_id,sender_id,sender_name,content,created_at) VALUES (?,?,?,?,?,?)",
      messageId,
      id,
      userId,
      user.display_name,
      input.content.trim(),
      now(),
    );
    for (const upload of uploads)
      run("INSERT INTO attachments VALUES (?,?)", messageId, upload);
    run(
      "UPDATE members SET read_seq=? WHERE conversation_id=? AND user_id=?",
      maxSeq(id),
      id,
      userId,
    );
  });
}
export function markRead(userId: string, id: string) {
  requireMember(userId, id);
  run(
    "UPDATE members SET read_seq=? WHERE conversation_id=? AND user_id=?",
    maxSeq(id),
    id,
    userId,
  );
}
export function react(
  userId: string,
  conversationId: string,
  messageId: string,
  emoji: string,
) {
  transaction(() => {
    const member = requireMember(userId, conversationId);
    if (
      !one(
        "SELECT 1 FROM messages WHERE id=? AND conversation_id=? AND seq>?",
        messageId,
        conversationId,
        member.cleared_seq,
      )
    )
      throw new ApiError(404, "Message not found.");
    const existing = one(
      "SELECT 1 FROM reactions WHERE message_id=? AND user_id=? AND emoji=?",
      messageId,
      userId,
      emoji,
    );
    if (existing)
      run(
        "DELETE FROM reactions WHERE message_id=? AND user_id=? AND emoji=?",
        messageId,
        userId,
        emoji,
      );
    else run("INSERT INTO reactions VALUES (?,?,?)", messageId, userId, emoji);
  });
}
export function updateSettings(
  userId: string,
  input: z.infer<typeof settingsSchema>,
) {
  transaction(() => applySettings(userId, input));
}
function applySettings(userId: string, input: z.infer<typeof settingsSchema>) {
  const userFields = {
    displayName: "display_name",
    statusMessage: "status_message",
    avatar: "avatar",
    presence: "presence",
    role: "role",
  } as const;
  const prefFields = {
    theme: "theme",
    density: "density",
    enterToSend: "enter_to_send",
    desktopNotifications: "desktop_notifications",
    soundNotifications: "sound_notifications",
  } as const;
  for (const [key, column] of Object.entries(userFields)) {
    const val = input[key as keyof typeof userFields];
    if (val !== undefined)
      run(`UPDATE users SET ${column}=? WHERE id=?`, val, userId);
  }
  for (const [key, column] of Object.entries(prefFields)) {
    const val = input[key as keyof typeof prefFields];
    if (val !== undefined)
      run(
        `UPDATE settings SET ${column}=? WHERE user_id=?`,
        typeof val === "boolean" ? Number(val) : val,
        userId,
      );
  }
}
export function clearHistory(userId: string) {
  run(
    "UPDATE members SET cleared_seq=?,read_seq=? WHERE user_id=?",
    maxSeq(),
    maxSeq(),
    userId,
  );
}
export function deleteAccount(userId: string) {
  transaction(() => {
    // Remove personal content, reactions, files, sessions and membership; preserve other members' history.
    run("DELETE FROM messages WHERE sender_id=?", userId);
    run(
      "DELETE FROM conversations WHERE archived_import=1 AND created_by=?",
      userId,
    );
    run(
      "DELETE FROM conversations WHERE id IN (SELECT id FROM channels WHERE owner_id=?) AND NOT EXISTS(SELECT 1 FROM members WHERE conversation_id=conversations.id AND user_id<>?)",
      userId,
      userId,
    );
    run(
      "UPDATE channels SET owner_id=(SELECT user_id FROM members WHERE conversation_id=channels.id AND user_id<>? ORDER BY user_id LIMIT 1) WHERE owner_id=?",
      userId,
      userId,
    );
    run("DELETE FROM users WHERE id=?", userId);
    run(
      "DELETE FROM conversations WHERE NOT EXISTS(SELECT 1 FROM members WHERE conversation_id=conversations.id) AND id NOT IN (SELECT id FROM channels)",
    );
  });
}
export function migrateLegacy(
  userId: string,
  input: z.infer<typeof migrationSchema>,
) {
  transaction(() => {
    if (getUser(userId).migration_completed) return;
    // Browser data is untrusted: isolate archived threads to prevent forged messages in live chats.
    for (const c of input.conversations || []) {
      const id = `import-${userId}-${c.id}`;
      run(
        "INSERT OR IGNORE INTO conversations (id,name,type,description,created_by,created_at,archived_import) VALUES (?,?,?,?,?,?,1)",
        id,
        `${c.name} (imported)`,
        c.type,
        c.description || "Imported from this browser",
        userId,
        now(),
      );
      run(
        "INSERT OR IGNORE INTO members (conversation_id,user_id) VALUES (?,?)",
        id,
        userId,
      );
      for (const m of c.messages)
        run(
          "INSERT OR IGNORE INTO messages (id,conversation_id,sender_id,sender_name,content,created_at,legacy_date,legacy_time,legacy_payload) VALUES (?,?,?,?,?,?,?,?,?)",
          `${id}-${m.id}`,
          id,
          m.isSentByMe ? userId : null,
          m.senderName,
          m.content,
          now(),
          m.date || null,
          m.timestamp || null,
          JSON.stringify(m),
        );
      run(
        "UPDATE members SET read_seq=? WHERE conversation_id=? AND user_id=?",
        maxSeq(id),
        id,
        userId,
      );
    }
    // Only join existing public channels; unknown names become isolated archives, never auto-invite private members.
    for (const c of input.channels || []) {
      if (!c.isJoined) continue;
      const existing = one<{ id: string }>(
        "SELECT id FROM channels WHERE name=? AND is_private=0",
        c.name,
      );
      if (existing)
        run(
          "INSERT OR IGNORE INTO members (conversation_id,user_id,read_seq) VALUES (?,?,?)",
          existing.id,
          userId,
          maxSeq(existing.id),
        );
      else {
        const suffix = userId.replace(/-/g, "").slice(0, 8);
        const safe = channelSchema.safeParse({
          name: `${c.name.slice(0, 60)}-${suffix}`,
          description: c.description,
          category: c.category,
          isPrivate: true,
        });
        if (!safe.success)
          throw new ApiError(400, "A legacy channel has an invalid name.");
        if (!one("SELECT id FROM channels WHERE name=?", safe.data.name)) {
          const id = randomUUID();
          run(
            "INSERT INTO conversations (id,name,type,description,created_by,created_at) VALUES (?,?,?,?,?,?)",
            id,
            `#${safe.data.name}`,
            "group",
            safe.data.description,
            userId,
            now(),
          );
          run(
            "INSERT INTO channels VALUES (?,?,?,?,1,?)",
            id,
            safe.data.name,
            safe.data.description,
            safe.data.category,
            userId,
          );
          run(
            "INSERT INTO members (conversation_id,user_id) VALUES (?,?)",
            id,
            userId,
          );
        }
      }
    }
    if (input.settings) {
      const { email: _email, ...settings } = input.settings;
      applySettings(userId, settings);
    }
    run(
      "INSERT INTO legacy_imports VALUES (?,?,?)",
      userId,
      JSON.stringify(input),
      now(),
    );
    run("UPDATE users SET migration_completed=1 WHERE id=?", userId);
  });
}
