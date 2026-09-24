CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Member',
  bio TEXT NOT NULL DEFAULT '',
  status_message TEXT NOT NULL DEFAULT '',
  presence TEXT NOT NULL DEFAULT 'online' CHECK(presence IN ('online','away','offline')),
  migration_completed INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK(theme IN ('light','dark')),
  density TEXT NOT NULL DEFAULT 'cozy' CHECK(density IN ('cozy','compact')),
  enter_to_send INTEGER NOT NULL DEFAULT 1,
  desktop_notifications INTEGER NOT NULL DEFAULT 1,
  sound_notifications INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('direct','group')),
  description TEXT NOT NULL DEFAULT '',
  direct_key TEXT UNIQUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  archived_import INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_seq INTEGER NOT NULL DEFAULT 0,
  cleared_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(conversation_id,user_id)
);
CREATE INDEX members_user ON members(user_id);
CREATE TABLE channels (
  id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('Engineering','Design','Product','General','Random')),
  is_private INTEGER NOT NULL DEFAULT 0,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  legacy_date TEXT,
  legacy_time TEXT
);
CREATE INDEX messages_conversation ON messages(conversation_id,seq);
CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('image','doc','pdf')),
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE attachments (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  PRIMARY KEY(message_id,upload_id)
);
CREATE TABLE reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  PRIMARY KEY(message_id,user_id,emoji)
);
CREATE TABLE blocked_users (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,blocked_id),
  CHECK(user_id <> blocked_id)
);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
