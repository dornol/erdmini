CREATE TABLE dictionaries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO dictionaries (id, name, description, is_default, created_by)
VALUES ('default', 'Default', 'Default word dictionary', 1, 'system');

CREATE TABLE word_dictionary_new (
  id TEXT PRIMARY KEY,
  dictionary_id TEXT NOT NULL DEFAULT 'default',
  word TEXT NOT NULL COLLATE NOCASE,
  meaning TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(dictionary_id, word)
);

INSERT INTO word_dictionary_new (
  id, dictionary_id, word, meaning, description, category, status, created_by, created_at, updated_at
)
SELECT
  id, 'default', word, meaning, description, category, status, created_by, created_at, updated_at
FROM word_dictionary;

DROP TABLE word_dictionary;
ALTER TABLE word_dictionary_new RENAME TO word_dictionary;

CREATE INDEX idx_word_dictionary_dictionary ON word_dictionary(dictionary_id);
CREATE INDEX idx_word_dictionary_word ON word_dictionary(word);
CREATE INDEX idx_word_dictionary_category ON word_dictionary(category);

CREATE TABLE dictionary_share_tokens_new (
  id TEXT PRIMARY KEY,
  dictionary_id TEXT NOT NULL DEFAULT 'default',
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);

INSERT INTO dictionary_share_tokens_new (
  id, dictionary_id, token, password_hash, created_by, created_at, expires_at
)
SELECT
  id, 'default', token, password_hash, created_by, created_at, expires_at
FROM dictionary_share_tokens;

DROP TABLE dictionary_share_tokens;
ALTER TABLE dictionary_share_tokens_new RENAME TO dictionary_share_tokens;

CREATE INDEX idx_dict_share_tokens_dictionary ON dictionary_share_tokens(dictionary_id);
CREATE INDEX idx_dict_share_tokens_token ON dictionary_share_tokens(token);
