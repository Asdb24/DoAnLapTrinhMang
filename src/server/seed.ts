import {
  initialSettings,
  initialContacts,
  initialConversations,
  initialChannels,
  initialBlockedUsers,
} from "../lib/mockData";
import { one, run, transaction } from "./db";
import { now } from "./service";

export function seedDemo() {
  transaction(() => {
    if (one("SELECT 1 FROM app_meta WHERE key='demo_seeded'")) return;
    run(
      "INSERT INTO users (id,email,display_name,avatar,role,status_message,presence,is_demo,created_at) VALUES (?,?,?,?,?,?,?,1,?)",
      "user-me",
      initialSettings.email,
      initialSettings.displayName,
      initialSettings.avatar,
      initialSettings.role,
      initialSettings.statusMessage,
      initialSettings.presence || "online",
      now(),
    );
    run("INSERT INTO settings (user_id) VALUES (?)", "user-me");
    for (const c of initialContacts) {
      run(
        "INSERT INTO users (id,email,display_name,avatar,role,bio,status_message,presence,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?,1,?)",
        c.id,
        c.email,
        c.name,
        c.avatar,
        c.role,
        c.bio,
        c.customStatus || "",
        c.presence,
        now(),
      );
      run("INSERT INTO settings (user_id) VALUES (?)", c.id);
    }
    for (const c of initialConversations) {
      const peer = initialContacts.find((p) => p.name === c.name);
      run(
        "INSERT INTO conversations (id,name,type,description,direct_key,created_by,created_at) VALUES (?,?,?,?,?,?,?)",
        c.id,
        c.name,
        c.type,
        c.description || "",
        peer ? ["user-me", peer.id].sort().join(":") : null,
        "user-me",
        now(),
      );
      const members = new Set([
        "user-me",
        ...(peer
          ? [peer.id]
          : c.messages.map((m) => m.senderId).filter((id) => id !== "system")),
      ]);
      for (const member of members)
        run(
          "INSERT INTO members (conversation_id,user_id) VALUES (?,?)",
          c.id,
          member,
        );
      for (const m of c.messages) {
        run(
          "INSERT INTO messages (id,conversation_id,sender_id,sender_name,content,created_at,legacy_date,legacy_time) VALUES (?,?,?,?,?,?,?,?)",
          m.id,
          c.id,
          m.senderId,
          m.senderName,
          m.content,
          now(),
          m.date,
          m.timestamp,
        );
        for (const r of m.reactions || []) {
          const reactors = r.reactedByMe
            ? ["user-me", ...initialContacts.map((p) => p.id)]
            : initialContacts.map((p) => p.id);
          for (const reactor of reactors.slice(0, r.count))
            run(
              "INSERT OR IGNORE INTO reactions VALUES (?,?,?)",
              m.id,
              reactor,
              r.emoji,
            );
        }
      }
      const seqs = one<{ n: number }>(
        "SELECT COALESCE(MAX(seq),0) AS n FROM messages WHERE conversation_id=?",
        c.id,
      )!.n;
      run(
        "UPDATE members SET read_seq=? WHERE conversation_id=? AND user_id=?",
        Math.max(0, seqs - c.unreadCount),
        c.id,
        "user-me",
      );
    }
    for (const c of initialChannels) {
      run(
        "INSERT INTO conversations (id,name,type,description,created_by,created_at) VALUES (?,?,?,?,?,?)",
        c.id,
        `#${c.name}`,
        "group",
        c.description,
        "contact-5",
        now(),
      );
      run(
        "INSERT INTO channels VALUES (?,?,?,?,?,?)",
        c.id,
        c.name,
        c.description,
        c.category,
        Number(c.isPrivate),
        "contact-5",
      );
      run(
        "INSERT INTO members (conversation_id,user_id) VALUES (?,?)",
        c.id,
        "contact-5",
      );
      if (c.isJoined)
        run(
          "INSERT INTO members (conversation_id,user_id) VALUES (?,?)",
          c.id,
          "user-me",
        );
    }
    for (const b of initialBlockedUsers) {
      run(
        "INSERT INTO users (id,email,display_name,avatar,presence,is_demo,created_at) VALUES (?,?,?,?,?,1,?)",
        b.id,
        `${b.id}@demo.invalid`,
        b.name,
        b.avatar,
        "offline",
        now(),
      );
      run("INSERT INTO settings (user_id) VALUES (?)", b.id);
      run("INSERT INTO blocked_users VALUES (?,?,?)", "user-me", b.id, now());
    }
    run("INSERT INTO app_meta VALUES ('demo_seeded','1')");
  });
}
