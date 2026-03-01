import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { hashPassword } from './password';
import { env } from '$env/dynamic/private';

export async function setupAdmin(db: Database.Database): Promise<void> {
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (userCount.cnt > 0) return;

  const username = env.ADMIN_USERNAME || 'admin';
  const password = env.ADMIN_PASSWORD || 'changeme';
  const adminId = randomUUID();
  const passwordHash = await hashPassword(password);

  db.prepare(
    `INSERT INTO users (id, username, display_name, role, password_hash)
     VALUES (?, ?, ?, 'admin', ?)`
  ).run(adminId, username, 'Admin', passwordHash);

  // Migrate existing singleton project_index data to admin user
  const singleton = db.prepare(
    "SELECT data FROM project_index WHERE id = 'singleton'"
  ).get() as { data: string } | undefined;

  if (singleton) {
    db.prepare(
      "UPDATE project_index SET user_id = ? WHERE id = 'singleton'"
    ).run(adminId);
  }
}
