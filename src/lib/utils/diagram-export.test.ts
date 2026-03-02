import { describe, it, expect, beforeEach } from 'vitest';
import { exportMermaid, exportPlantUML } from './diagram-export';
import { makeColumn, makeTable, makeSchema, resetIdCounter } from './test-helpers';

beforeEach(() => resetIdCounter());

function sampleSchema() {
  const userId = 'u_id';
  const postUserId = 'p_user_id';

  const users = makeTable({
    id: 'tbl_users',
    name: 'users',
    columns: [
      makeColumn({ id: userId, name: 'id', type: 'INT', primaryKey: true, nullable: false, autoIncrement: true }),
      makeColumn({ name: 'name', type: 'VARCHAR', length: 100, nullable: false }),
      makeColumn({ name: 'email', type: 'VARCHAR', unique: true, nullable: false }),
    ],
  });

  const posts = makeTable({
    id: 'tbl_posts',
    name: 'posts',
    columns: [
      makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false }),
      makeColumn({ id: postUserId, name: 'user_id', type: 'INT', nullable: false }),
      makeColumn({ name: 'title', type: 'VARCHAR', nullable: false }),
    ],
    foreignKeys: [
      {
        id: 'fk_1',
        columnIds: [postUserId],
        referencedTableId: 'tbl_users',
        referencedColumnIds: [userId],
        onDelete: 'CASCADE',
        onUpdate: 'RESTRICT',
      },
    ],
  });

  return makeSchema([users, posts]);
}

describe('exportMermaid', () => {
  it('starts with erDiagram', () => {
    const result = exportMermaid(sampleSchema());
    expect(result).toMatch(/^erDiagram/);
  });

  it('includes entity blocks for each table', () => {
    const result = exportMermaid(sampleSchema());
    expect(result).toContain('users {');
    expect(result).toContain('posts {');
  });

  it('marks PK columns', () => {
    const result = exportMermaid(sampleSchema());
    expect(result).toContain('PK');
  });

  it('marks FK columns', () => {
    const result = exportMermaid(sampleSchema());
    expect(result).toContain('FK');
  });

  it('marks UK columns', () => {
    const result = exportMermaid(sampleSchema());
    expect(result).toContain('UK');
  });

  it('includes relationship line', () => {
    const result = exportMermaid(sampleSchema());
    // FK from posts.user_id (not nullable) → users.id → ||--|{
    expect(result).toContain('users ||--|{ posts');
  });

  it('marks nullable FK with o{ instead of |{', () => {
    const schema = sampleSchema();
    const postUserCol = schema.tables[1].columns.find((c) => c.name === 'user_id')!;
    postUserCol.nullable = true;
    const result = exportMermaid(schema);
    expect(result).toContain('users ||--o{ posts');
  });

  it('handles empty schema', () => {
    const result = exportMermaid(makeSchema([]));
    expect(result).toBe('erDiagram');
  });
});

describe('exportPlantUML', () => {
  it('wraps output in @startuml/@enduml', () => {
    const result = exportPlantUML(sampleSchema());
    expect(result).toMatch(/^@startuml/);
    expect(result).toMatch(/@enduml$/);
  });

  it('declares entities for each table', () => {
    const result = exportPlantUML(sampleSchema());
    expect(result).toContain('entity "users"');
    expect(result).toContain('entity "posts"');
  });

  it('marks PK columns with * prefix and <<PK>> stereotype', () => {
    const result = exportPlantUML(sampleSchema());
    expect(result).toContain('* id : INT');
    expect(result).toContain('<<PK>>');
  });

  it('marks FK columns with <<FK>> stereotype', () => {
    const result = exportPlantUML(sampleSchema());
    expect(result).toContain('<<FK>>');
  });

  it('marks auto-increment columns with AI in stereotype', () => {
    const result = exportPlantUML(sampleSchema());
    expect(result).toMatch(/<<.*AI.*>>/);
  });

  it('marks UK columns with <<UK>> stereotype', () => {
    const result = exportPlantUML(sampleSchema());
    expect(result).toContain('<<UK>>');
  });

  it('includes relationship line', () => {
    const result = exportPlantUML(sampleSchema());
    // Non-nullable FK → ||--|{
    expect(result).toContain('users ||--|{ posts');
  });

  it('uses separator line between PK and non-PK columns', () => {
    const result = exportPlantUML(sampleSchema());
    expect(result).toContain('--');
  });

  it('handles empty schema', () => {
    const result = exportPlantUML(makeSchema([]));
    expect(result).toContain('@startuml');
    expect(result).toContain('@enduml');
  });

  it('marks nullable FK with o{ instead of |{', () => {
    const schema = sampleSchema();
    const postUserCol = schema.tables[1].columns.find((c) => c.name === 'user_id')!;
    postUserCol.nullable = true;
    const result = exportPlantUML(schema);
    expect(result).toContain('users ||--o{ posts');
  });

  it('sanitizes special characters in table names', () => {
    const schema = makeSchema([
      makeTable({
        name: 'order-items',
        columns: [makeColumn({ name: 'id', type: 'INT', primaryKey: true, nullable: false })],
      }),
    ]);
    const result = exportPlantUML(schema);
    expect(result).toContain('entity "order-items" as order_items');
  });
});
