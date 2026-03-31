-- Word Dictionary: system-global word → meaning mappings for column naming standards
CREATE TABLE word_dictionary (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL UNIQUE COLLATE NOCASE,
  meaning TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_word_dictionary_word ON word_dictionary(word);
CREATE INDEX idx_word_dictionary_category ON word_dictionary(category);

-- Share tokens for external dictionary access (mirrors embed_tokens pattern)
CREATE TABLE dictionary_share_tokens (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);
CREATE INDEX idx_dict_share_tokens_token ON dictionary_share_tokens(token);
