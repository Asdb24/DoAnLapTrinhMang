ALTER TABLE messages ADD COLUMN legacy_payload TEXT;
CREATE TABLE legacy_imports (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
