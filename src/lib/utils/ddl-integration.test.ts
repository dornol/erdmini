/**
 * Integration tests using real-world DDL schemas.
 * These test actual production DDLs from popular frameworks and applications
 * to ensure our import handles real usage correctly.
 */
import { describe, it, expect } from 'vitest';
import { importDDL } from './ddl-import';
import { exportDDL } from './ddl-export';
import { diffSchemas } from './schema-diff';
import type { ERDSchema, Table } from '$lib/types/erd';

// ─── helpers ────────────────────────────────────────────────────
function findTable(tables: Table[], name: string): Table {
	const t = tables.find((t) => t.name.toLowerCase() === name.toLowerCase());
	if (!t) throw new Error(`Table "${name}" not found. Available: ${tables.map((t) => t.name).join(', ')}`);
	return t;
}

function toSchema(tables: Table[]): ERDSchema {
	return { version: '1.0', tables, domains: [], memos: [], createdAt: '', updatedAt: '' };
}

function findCol(table: Table, name: string) {
	const c = table.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
	if (!c) throw new Error(`Column "${name}" not in ${table.name}. Available: ${table.columns.map((c) => c.name).join(', ')}`);
	return c;
}

function pkNames(table: Table): string[] {
	return table.columns.filter((c) => c.primaryKey).map((c) => c.name);
}

/** Check if a table has a FK pointing to another table */
function hasFKTo(srcTable: Table, targetTable: Table): boolean {
	return srcTable.foreignKeys.some((fk) => fk.referencedTableId === targetTable.id);
}

/** Find a FK from srcTable pointing to targetTable */
function findFK(srcTable: Table, targetTable: Table) {
	return srcTable.foreignKeys.find((fk) => fk.referencedTableId === targetTable.id);
}

/** Check if table has a unique key covering given column names */
function hasUniqueKey(table: Table, colNames: string[]): boolean {
	const colIds = new Set(colNames.map((n) => findCol(table, n).id));
	return (
		table.uniqueKeys?.some(
			(uk) => uk.columnIds.length === colIds.size && uk.columnIds.every((id) => colIds.has(id))
		) ?? false
	);
}

/** Check if table has an index covering a given column name */
function hasIndexOn(table: Table, colName: string): boolean {
	const colId = findCol(table, colName).id;
	return table.indexes?.some((idx) => idx.columnIds.includes(colId)) ?? false;
}

// ═══════════════════════════════════════════════════════════════════
// MySQL — WordPress Core Tables
// ═══════════════════════════════════════════════════════════════════
describe('Integration: WordPress (MySQL)', () => {
	const WP_DDL = `
CREATE TABLE wp_users (
  ID bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  user_login varchar(60) NOT NULL DEFAULT '',
  user_pass varchar(255) NOT NULL DEFAULT '',
  user_nicename varchar(50) NOT NULL DEFAULT '',
  user_email varchar(100) NOT NULL DEFAULT '',
  user_url varchar(100) NOT NULL DEFAULT '',
  user_registered datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  user_activation_key varchar(255) NOT NULL DEFAULT '',
  user_status int(11) NOT NULL DEFAULT 0,
  display_name varchar(250) NOT NULL DEFAULT '',
  PRIMARY KEY (ID),
  KEY user_login_key (user_login),
  KEY user_nicename (user_nicename),
  KEY user_email (user_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE wp_usermeta (
  umeta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  user_id bigint(20) unsigned NOT NULL DEFAULT 0,
  meta_key varchar(255) DEFAULT NULL,
  meta_value longtext,
  PRIMARY KEY (umeta_id),
  KEY user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE wp_posts (
  ID bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  post_author bigint(20) unsigned NOT NULL DEFAULT 0,
  post_date datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  post_date_gmt datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  post_content longtext NOT NULL,
  post_title text NOT NULL,
  post_excerpt text NOT NULL,
  post_status varchar(20) NOT NULL DEFAULT 'publish',
  comment_status varchar(20) NOT NULL DEFAULT 'open',
  ping_status varchar(20) NOT NULL DEFAULT 'open',
  post_password varchar(255) NOT NULL DEFAULT '',
  post_name varchar(200) NOT NULL DEFAULT '',
  to_ping text NOT NULL,
  pinged text NOT NULL,
  post_modified datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  post_modified_gmt datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  post_content_filtered longtext NOT NULL,
  post_parent bigint(20) unsigned NOT NULL DEFAULT 0,
  guid varchar(255) NOT NULL DEFAULT '',
  menu_order int(11) NOT NULL DEFAULT 0,
  post_type varchar(20) NOT NULL DEFAULT 'post',
  post_mime_type varchar(100) NOT NULL DEFAULT '',
  comment_count bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (ID),
  KEY post_name (post_name(191)),
  KEY type_status_date (post_type, post_status, post_date, ID),
  KEY post_parent (post_parent),
  KEY post_author (post_author)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE wp_comments (
  comment_ID bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  comment_post_ID bigint(20) unsigned NOT NULL DEFAULT 0,
  comment_author tinytext NOT NULL,
  comment_author_email varchar(100) NOT NULL DEFAULT '',
  comment_author_url varchar(200) NOT NULL DEFAULT '',
  comment_author_IP varchar(100) NOT NULL DEFAULT '',
  comment_date datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  comment_date_gmt datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
  comment_content text NOT NULL,
  comment_karma int(11) NOT NULL DEFAULT 0,
  comment_approved varchar(20) NOT NULL DEFAULT '1',
  comment_agent varchar(255) NOT NULL DEFAULT '',
  comment_type varchar(20) NOT NULL DEFAULT 'comment',
  comment_parent bigint(20) unsigned NOT NULL DEFAULT 0,
  user_id bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (comment_ID),
  KEY comment_post_ID (comment_post_ID),
  KEY comment_approved_date_gmt (comment_approved, comment_date_gmt),
  KEY comment_date_gmt (comment_date_gmt),
  KEY comment_parent (comment_parent),
  KEY comment_author_email (comment_author_email(10))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE wp_postmeta (
  meta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  post_id bigint(20) unsigned NOT NULL DEFAULT 0,
  meta_key varchar(255) DEFAULT NULL,
  meta_value longtext,
  PRIMARY KEY (meta_id),
  KEY post_id (post_id),
  KEY meta_key (meta_key(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE wp_options (
  option_id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  option_name varchar(191) NOT NULL DEFAULT '',
  option_value longtext NOT NULL,
  autoload varchar(20) NOT NULL DEFAULT 'yes',
  PRIMARY KEY (option_id),
  UNIQUE KEY option_name (option_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE wp_terms (
  term_id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  name varchar(200) NOT NULL DEFAULT '',
  slug varchar(200) NOT NULL DEFAULT '',
  term_group bigint(10) NOT NULL DEFAULT 0,
  PRIMARY KEY (term_id),
  KEY slug (slug(191)),
  KEY name (name(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE wp_term_taxonomy (
  term_taxonomy_id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  term_id bigint(20) unsigned NOT NULL DEFAULT 0,
  taxonomy varchar(32) NOT NULL DEFAULT '',
  description longtext NOT NULL,
  parent bigint(20) unsigned NOT NULL DEFAULT 0,
  count bigint(20) NOT NULL DEFAULT 0,
  PRIMARY KEY (term_taxonomy_id),
  UNIQUE KEY term_id_taxonomy (term_id, taxonomy),
  KEY taxonomy (taxonomy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

CREATE TABLE wp_term_relationships (
  object_id bigint(20) unsigned NOT NULL DEFAULT 0,
  term_taxonomy_id bigint(20) unsigned NOT NULL DEFAULT 0,
  term_order int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (object_id, term_taxonomy_id),
  KEY term_taxonomy_id (term_taxonomy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
`;

	it('imports all 9 WordPress tables', async () => {
		const { tables, errors } = await importDDL(WP_DDL, 'mysql');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(9);
	});

	it('wp_users — columns and auto-increment PK', async () => {
		const { tables } = await importDDL(WP_DDL, 'mysql');
		const t = findTable(tables, 'wp_users');
		expect(t.columns.length).toBe(10);
		const id = findCol(t, 'ID');
		expect(id.primaryKey).toBe(true);
		expect(id.autoIncrement).toBe(true);
		expect(id.type).toBe('BIGINT');
		expect(findCol(t, 'user_login').type).toBe('VARCHAR');
		expect(findCol(t, 'user_registered').type).toBe('DATETIME'); // MySQL DATETIME preserved
		expect(findCol(t, 'user_status').type).toBe('INT');
	});

	it('wp_posts — 23 columns, text/longtext → TEXT', async () => {
		const { tables } = await importDDL(WP_DDL, 'mysql');
		const t = findTable(tables, 'wp_posts');
		expect(t.columns.length).toBe(23);
		expect(findCol(t, 'post_content').type).toBe('TEXT');
		expect(findCol(t, 'post_title').type).toBe('TEXT');
		expect(findCol(t, 'post_status').type).toBe('VARCHAR');
	});

	it('wp_comments — 15 columns with tinytext → TEXT', async () => {
		const { tables } = await importDDL(WP_DDL, 'mysql');
		const t = findTable(tables, 'wp_comments');
		expect(t.columns.length).toBe(15);
		expect(findCol(t, 'comment_ID').autoIncrement).toBe(true);
		expect(findCol(t, 'comment_author').type).toBe('TEXT');
	});

	it('wp_options — unique key on option_name', async () => {
		const { tables } = await importDDL(WP_DDL, 'mysql');
		const t = findTable(tables, 'wp_options');
		expect(findCol(t, 'option_name').unique).toBe(true);
	});

	it('wp_term_relationships — composite primary key', async () => {
		const { tables } = await importDDL(WP_DDL, 'mysql');
		const t = findTable(tables, 'wp_term_relationships');
		const pks = pkNames(t);
		expect(pks.length).toBe(2);
		expect(pks).toContain('object_id');
		expect(pks).toContain('term_taxonomy_id');
	});

	it('wp_term_taxonomy — composite unique on (term_id, taxonomy)', async () => {
		const { tables } = await importDDL(WP_DDL, 'mysql');
		const t = findTable(tables, 'wp_term_taxonomy');
		expect(hasUniqueKey(t, ['term_id', 'taxonomy'])).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════════
// MySQL — Spring Batch
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Spring Batch (MySQL)', () => {
	const SPRING_BATCH_MYSQL = `
CREATE TABLE BATCH_JOB_INSTANCE (
  JOB_INSTANCE_ID BIGINT NOT NULL PRIMARY KEY,
  VERSION BIGINT,
  JOB_NAME VARCHAR(100) NOT NULL,
  JOB_KEY VARCHAR(32) NOT NULL,
  CONSTRAINT JOB_INST_UN UNIQUE (JOB_NAME, JOB_KEY)
) ENGINE=InnoDB;

CREATE TABLE BATCH_JOB_EXECUTION (
  JOB_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
  VERSION BIGINT,
  JOB_INSTANCE_ID BIGINT NOT NULL,
  CREATE_TIME DATETIME(6) NOT NULL,
  START_TIME DATETIME(6) DEFAULT NULL,
  END_TIME DATETIME(6) DEFAULT NULL,
  STATUS VARCHAR(10),
  EXIT_CODE VARCHAR(2500),
  EXIT_MESSAGE VARCHAR(2500),
  LAST_UPDATED DATETIME(6),
  CONSTRAINT JOB_INST_EXEC_FK FOREIGN KEY (JOB_INSTANCE_ID) REFERENCES BATCH_JOB_INSTANCE(JOB_INSTANCE_ID)
) ENGINE=InnoDB;

CREATE TABLE BATCH_JOB_EXECUTION_PARAMS (
  JOB_EXECUTION_ID BIGINT NOT NULL,
  PARAMETER_NAME VARCHAR(100) NOT NULL,
  PARAMETER_TYPE VARCHAR(100) NOT NULL,
  PARAMETER_VALUE VARCHAR(2500),
  IDENTIFYING CHAR(1) NOT NULL,
  CONSTRAINT JOB_EXEC_PARAMS_FK FOREIGN KEY (JOB_EXECUTION_ID) REFERENCES BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
) ENGINE=InnoDB;

CREATE TABLE BATCH_STEP_EXECUTION (
  STEP_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
  VERSION BIGINT NOT NULL,
  STEP_NAME VARCHAR(100) NOT NULL,
  JOB_EXECUTION_ID BIGINT NOT NULL,
  CREATE_TIME DATETIME(6) NOT NULL,
  START_TIME DATETIME(6) DEFAULT NULL,
  END_TIME DATETIME(6) DEFAULT NULL,
  STATUS VARCHAR(10),
  COMMIT_COUNT BIGINT,
  READ_COUNT BIGINT,
  FILTER_COUNT BIGINT,
  WRITE_COUNT BIGINT,
  READ_SKIP_COUNT BIGINT,
  WRITE_SKIP_COUNT BIGINT,
  PROCESS_SKIP_COUNT BIGINT,
  ROLLBACK_COUNT BIGINT,
  EXIT_CODE VARCHAR(2500),
  EXIT_MESSAGE VARCHAR(2500),
  LAST_UPDATED DATETIME(6),
  CONSTRAINT JOB_EXEC_STEP_FK FOREIGN KEY (JOB_EXECUTION_ID) REFERENCES BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
) ENGINE=InnoDB;

CREATE TABLE BATCH_STEP_EXECUTION_CONTEXT (
  STEP_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
  SHORT_CONTEXT VARCHAR(2500) NOT NULL,
  SERIALIZED_CONTEXT TEXT,
  CONSTRAINT STEP_EXEC_CTX_FK FOREIGN KEY (STEP_EXECUTION_ID) REFERENCES BATCH_STEP_EXECUTION(STEP_EXECUTION_ID)
) ENGINE=InnoDB;

CREATE TABLE BATCH_JOB_EXECUTION_CONTEXT (
  JOB_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
  SHORT_CONTEXT VARCHAR(2500) NOT NULL,
  SERIALIZED_CONTEXT TEXT,
  CONSTRAINT JOB_EXEC_CTX_FK FOREIGN KEY (JOB_EXECUTION_ID) REFERENCES BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
) ENGINE=InnoDB;
`;

	it('imports all 6 tables', async () => {
		const { tables, errors } = await importDDL(SPRING_BATCH_MYSQL, 'mysql');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(6);
	});

	it('FK chain: execution → instance, step → execution', async () => {
		const { tables } = await importDDL(SPRING_BATCH_MYSQL, 'mysql');
		const inst = findTable(tables, 'BATCH_JOB_INSTANCE');
		const exec = findTable(tables, 'BATCH_JOB_EXECUTION');
		const step = findTable(tables, 'BATCH_STEP_EXECUTION');

		expect(hasFKTo(exec, inst)).toBe(true);
		expect(hasFKTo(step, exec)).toBe(true);
	});

	it('BATCH_JOB_INSTANCE — composite unique on (JOB_NAME, JOB_KEY)', async () => {
		const { tables } = await importDDL(SPRING_BATCH_MYSQL, 'mysql');
		const t = findTable(tables, 'BATCH_JOB_INSTANCE');
		expect(hasUniqueKey(t, ['JOB_NAME', 'JOB_KEY'])).toBe(true);
	});

	it('BATCH_STEP_EXECUTION — 19 columns with various types', async () => {
		const { tables } = await importDDL(SPRING_BATCH_MYSQL, 'mysql');
		const t = findTable(tables, 'BATCH_STEP_EXECUTION');
		expect(t.columns.length).toBe(19);
		expect(findCol(t, 'COMMIT_COUNT').type).toBe('BIGINT');
		expect(findCol(t, 'STATUS').type).toBe('VARCHAR');
	});
});

// ═══════════════════════════════════════════════════════════════════
// MySQL — Spring Session
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Spring Session (MySQL)', () => {
	const SPRING_SESSION_MYSQL = `
CREATE TABLE SPRING_SESSION (
  PRIMARY_ID CHAR(36) NOT NULL,
  SESSION_ID CHAR(36) NOT NULL,
  CREATION_TIME BIGINT NOT NULL,
  LAST_ACCESS_TIME BIGINT NOT NULL,
  MAX_INACTIVE_INTERVAL INT NOT NULL,
  EXPIRY_TIME BIGINT NOT NULL,
  PRINCIPAL_NAME VARCHAR(100),
  CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
  SESSION_PRIMARY_ID CHAR(36) NOT NULL,
  ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
  ATTRIBUTE_BYTES BLOB NOT NULL,
  CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
  CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;
`;

	it('imports 2 tables', async () => {
		const { tables, errors } = await importDDL(SPRING_SESSION_MYSQL, 'mysql');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(2);
	});

	it('SPRING_SESSION_ATTRIBUTES — FK with CASCADE delete and composite PK', async () => {
		const { tables } = await importDDL(SPRING_SESSION_MYSQL, 'mysql');
		const session = findTable(tables, 'SPRING_SESSION');
		const attrs = findTable(tables, 'SPRING_SESSION_ATTRIBUTES');

		expect(pkNames(attrs).length).toBe(2);
		expect(hasFKTo(attrs, session)).toBe(true);
		const fk = findFK(attrs, session);
		expect(fk?.onDelete).toBe('CASCADE');
	});

	it('SPRING_SESSION — CHAR(36) and BIGINT types', async () => {
		const { tables } = await importDDL(SPRING_SESSION_MYSQL, 'mysql');
		const t = findTable(tables, 'SPRING_SESSION');
		expect(findCol(t, 'PRIMARY_ID').type).toBe('CHAR');
		expect(findCol(t, 'CREATION_TIME').type).toBe('BIGINT');
		expect(findCol(t, 'MAX_INACTIVE_INTERVAL').type).toBe('INT');
	});
});

// ═══════════════════════════════════════════════════════════════════
// PostgreSQL — Spring Batch
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Spring Batch (PostgreSQL)', () => {
	const SPRING_BATCH_PG = `
CREATE TABLE BATCH_JOB_INSTANCE (
  JOB_INSTANCE_ID BIGINT NOT NULL PRIMARY KEY,
  VERSION BIGINT,
  JOB_NAME VARCHAR(100) NOT NULL,
  JOB_KEY VARCHAR(32) NOT NULL,
  CONSTRAINT JOB_INST_UN UNIQUE (JOB_NAME, JOB_KEY)
);

CREATE TABLE BATCH_JOB_EXECUTION (
  JOB_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
  VERSION BIGINT,
  JOB_INSTANCE_ID BIGINT NOT NULL,
  CREATE_TIME TIMESTAMP NOT NULL,
  START_TIME TIMESTAMP DEFAULT NULL,
  END_TIME TIMESTAMP DEFAULT NULL,
  STATUS VARCHAR(10),
  EXIT_CODE VARCHAR(2500),
  EXIT_MESSAGE VARCHAR(2500),
  LAST_UPDATED TIMESTAMP,
  CONSTRAINT JOB_INST_EXEC_FK FOREIGN KEY (JOB_INSTANCE_ID) REFERENCES BATCH_JOB_INSTANCE(JOB_INSTANCE_ID)
);

CREATE TABLE BATCH_JOB_EXECUTION_PARAMS (
  JOB_EXECUTION_ID BIGINT NOT NULL,
  PARAMETER_NAME VARCHAR(100) NOT NULL,
  PARAMETER_TYPE VARCHAR(100) NOT NULL,
  PARAMETER_VALUE VARCHAR(2500),
  IDENTIFYING CHAR(1) NOT NULL,
  CONSTRAINT JOB_EXEC_PARAMS_FK FOREIGN KEY (JOB_EXECUTION_ID) REFERENCES BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
);

CREATE TABLE BATCH_STEP_EXECUTION (
  STEP_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
  VERSION BIGINT NOT NULL,
  STEP_NAME VARCHAR(100) NOT NULL,
  JOB_EXECUTION_ID BIGINT NOT NULL,
  CREATE_TIME TIMESTAMP NOT NULL,
  START_TIME TIMESTAMP DEFAULT NULL,
  END_TIME TIMESTAMP DEFAULT NULL,
  STATUS VARCHAR(10),
  COMMIT_COUNT BIGINT,
  READ_COUNT BIGINT,
  FILTER_COUNT BIGINT,
  WRITE_COUNT BIGINT,
  READ_SKIP_COUNT BIGINT,
  WRITE_SKIP_COUNT BIGINT,
  PROCESS_SKIP_COUNT BIGINT,
  ROLLBACK_COUNT BIGINT,
  EXIT_CODE VARCHAR(2500),
  EXIT_MESSAGE VARCHAR(2500),
  LAST_UPDATED TIMESTAMP,
  CONSTRAINT JOB_EXEC_STEP_FK FOREIGN KEY (JOB_EXECUTION_ID) REFERENCES BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
);

CREATE TABLE BATCH_STEP_EXECUTION_CONTEXT (
  STEP_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
  SHORT_CONTEXT VARCHAR(2500) NOT NULL,
  SERIALIZED_CONTEXT TEXT,
  CONSTRAINT STEP_EXEC_CTX_FK FOREIGN KEY (STEP_EXECUTION_ID) REFERENCES BATCH_STEP_EXECUTION(STEP_EXECUTION_ID)
);

CREATE TABLE BATCH_JOB_EXECUTION_CONTEXT (
  JOB_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
  SHORT_CONTEXT VARCHAR(2500) NOT NULL,
  SERIALIZED_CONTEXT TEXT,
  CONSTRAINT JOB_EXEC_CTX_FK FOREIGN KEY (JOB_EXECUTION_ID) REFERENCES BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
);
`;

	it('imports all 6 tables with TIMESTAMP columns', async () => {
		const { tables, errors } = await importDDL(SPRING_BATCH_PG, 'postgresql');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(6);
		const exec = findTable(tables, 'BATCH_JOB_EXECUTION');
		expect(findCol(exec, 'CREATE_TIME').type).toBe('TIMESTAMP');
	});

	it('all FK chain properly resolved', async () => {
		const { tables } = await importDDL(SPRING_BATCH_PG, 'postgresql');
		const inst = findTable(tables, 'BATCH_JOB_INSTANCE');
		const exec = findTable(tables, 'BATCH_JOB_EXECUTION');
		const step = findTable(tables, 'BATCH_STEP_EXECUTION');
		const stepCtx = findTable(tables, 'BATCH_STEP_EXECUTION_CONTEXT');
		const execCtx = findTable(tables, 'BATCH_JOB_EXECUTION_CONTEXT');

		expect(hasFKTo(exec, inst)).toBe(true);
		expect(hasFKTo(step, exec)).toBe(true);
		expect(hasFKTo(stepCtx, step)).toBe(true);
		expect(hasFKTo(execCtx, exec)).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════════
// PostgreSQL — Spring Session
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Spring Session (PostgreSQL)', () => {
	const SPRING_SESSION_PG = `
CREATE TABLE SPRING_SESSION (
  PRIMARY_ID CHAR(36) NOT NULL,
  SESSION_ID CHAR(36) NOT NULL,
  CREATION_TIME BIGINT NOT NULL,
  LAST_ACCESS_TIME BIGINT NOT NULL,
  MAX_INACTIVE_INTERVAL INT NOT NULL,
  EXPIRY_TIME BIGINT NOT NULL,
  PRINCIPAL_NAME VARCHAR(100),
  CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
  SESSION_PRIMARY_ID CHAR(36) NOT NULL,
  ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
  ATTRIBUTE_BYTES BYTEA NOT NULL,
  CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
  CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
);
`;

	it('imports 2 tables', async () => {
		const { tables, errors } = await importDDL(SPRING_SESSION_PG, 'postgresql');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(2);
	});

	it('unique index extracted on SESSION_ID', async () => {
		const { tables } = await importDDL(SPRING_SESSION_PG, 'postgresql');
		const session = findTable(tables, 'SPRING_SESSION');
		// CREATE UNIQUE INDEX → column marked unique or stored as index
		expect(findCol(session, 'SESSION_ID').unique || hasIndexOn(session, 'SESSION_ID')).toBe(true);
	});

	it('FK with CASCADE delete', async () => {
		const { tables } = await importDDL(SPRING_SESSION_PG, 'postgresql');
		const session = findTable(tables, 'SPRING_SESSION');
		const attrs = findTable(tables, 'SPRING_SESSION_ATTRIBUTES');
		const fk = findFK(attrs, session);
		expect(fk).toBeDefined();
		expect(fk!.onDelete).toBe('CASCADE');
	});
});

// ═══════════════════════════════════════════════════════════════════
// MSSQL — ASP.NET Core Identity
// ═══════════════════════════════════════════════════════════════════
describe('Integration: ASP.NET Core Identity (MSSQL)', () => {
	const ASPNET_IDENTITY = `
CREATE TABLE [AspNetRoles] (
    [Id] nvarchar(450) NOT NULL,
    [Name] nvarchar(256) NULL,
    [NormalizedName] nvarchar(256) NULL,
    [ConcurrencyStamp] nvarchar(max) NULL,
    CONSTRAINT [PK_AspNetRoles] PRIMARY KEY ([Id])
);

CREATE TABLE [AspNetUsers] (
    [Id] nvarchar(450) NOT NULL,
    [UserName] nvarchar(256) NULL,
    [NormalizedUserName] nvarchar(256) NULL,
    [Email] nvarchar(256) NULL,
    [NormalizedEmail] nvarchar(256) NULL,
    [EmailConfirmed] bit NOT NULL,
    [PasswordHash] nvarchar(max) NULL,
    [SecurityStamp] nvarchar(max) NULL,
    [ConcurrencyStamp] nvarchar(max) NULL,
    [PhoneNumber] nvarchar(max) NULL,
    [PhoneNumberConfirmed] bit NOT NULL,
    [TwoFactorEnabled] bit NOT NULL,
    [LockoutEnd] datetimeoffset NULL,
    [LockoutEnabled] bit NOT NULL,
    [AccessFailedCount] int NOT NULL,
    CONSTRAINT [PK_AspNetUsers] PRIMARY KEY ([Id])
);

CREATE TABLE [AspNetRoleClaims] (
    [Id] int NOT NULL IDENTITY,
    [RoleId] nvarchar(450) NOT NULL,
    [ClaimType] nvarchar(max) NULL,
    [ClaimValue] nvarchar(max) NULL,
    CONSTRAINT [PK_AspNetRoleClaims] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_AspNetRoleClaims_AspNetRoles_RoleId] FOREIGN KEY ([RoleId]) REFERENCES [AspNetRoles] ([Id]) ON DELETE CASCADE
);

CREATE TABLE [AspNetUserClaims] (
    [Id] int NOT NULL IDENTITY,
    [UserId] nvarchar(450) NOT NULL,
    [ClaimType] nvarchar(max) NULL,
    [ClaimValue] nvarchar(max) NULL,
    CONSTRAINT [PK_AspNetUserClaims] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_AspNetUserClaims_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE
);

CREATE TABLE [AspNetUserLogins] (
    [LoginProvider] nvarchar(128) NOT NULL,
    [ProviderKey] nvarchar(128) NOT NULL,
    [ProviderDisplayName] nvarchar(max) NULL,
    [UserId] nvarchar(450) NOT NULL,
    CONSTRAINT [PK_AspNetUserLogins] PRIMARY KEY ([LoginProvider], [ProviderKey]),
    CONSTRAINT [FK_AspNetUserLogins_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE
);

CREATE TABLE [AspNetUserRoles] (
    [UserId] nvarchar(450) NOT NULL,
    [RoleId] nvarchar(450) NOT NULL,
    CONSTRAINT [PK_AspNetUserRoles] PRIMARY KEY ([UserId], [RoleId]),
    CONSTRAINT [FK_AspNetUserRoles_AspNetRoles_RoleId] FOREIGN KEY ([RoleId]) REFERENCES [AspNetRoles] ([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_AspNetUserRoles_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE
);

CREATE TABLE [AspNetUserTokens] (
    [UserId] nvarchar(450) NOT NULL,
    [LoginProvider] nvarchar(128) NOT NULL,
    [Name] nvarchar(128) NOT NULL,
    [Value] nvarchar(max) NULL,
    CONSTRAINT [PK_AspNetUserTokens] PRIMARY KEY ([UserId], [LoginProvider], [Name]),
    CONSTRAINT [FK_AspNetUserTokens_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [AspNetUsers] ([Id]) ON DELETE CASCADE
);
`;

	it('imports all 7 tables', async () => {
		const { tables, errors } = await importDDL(ASPNET_IDENTITY, 'mssql');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(7);
	});

	it('AspNetUsers — 15 columns with NVARCHAR and BIT types', async () => {
		const { tables } = await importDDL(ASPNET_IDENTITY, 'mssql');
		const users = findTable(tables, 'AspNetUsers');
		expect(users.columns.length).toBe(15);
		expect(findCol(users, 'Id').type).toBe('VARCHAR'); // nvarchar → VARCHAR
		expect(findCol(users, 'EmailConfirmed').type).toBe('BOOLEAN'); // bit → BOOLEAN
		expect(findCol(users, 'AccessFailedCount').type).toBe('INT');
	});

	it('AspNetRoleClaims — IDENTITY auto-increment + FK', async () => {
		const { tables } = await importDDL(ASPNET_IDENTITY, 'mssql');
		const roleClaims = findTable(tables, 'AspNetRoleClaims');
		const roles = findTable(tables, 'AspNetRoles');
		const id = findCol(roleClaims, 'Id');
		expect(id.primaryKey).toBe(true);
		expect(id.autoIncrement).toBe(true);
		expect(id.type).toBe('INT');
		expect(hasFKTo(roleClaims, roles)).toBe(true);
	});

	it('AspNetUserRoles — composite PK + 2 FKs', async () => {
		const { tables } = await importDDL(ASPNET_IDENTITY, 'mssql');
		const userRoles = findTable(tables, 'AspNetUserRoles');
		expect(pkNames(userRoles).length).toBe(2);
		expect(userRoles.foreignKeys.length).toBe(2);
	});

	it('AspNetUserTokens — triple composite PK', async () => {
		const { tables } = await importDDL(ASPNET_IDENTITY, 'mssql');
		const tokens = findTable(tables, 'AspNetUserTokens');
		expect(pkNames(tokens).length).toBe(3);
	});

	it('nvarchar(max) → VARCHAR (MSSQL preprocessor converts max to fixed length)', async () => {
		const { tables } = await importDDL(ASPNET_IDENTITY, 'mssql');
		const users = findTable(tables, 'AspNetUsers');
		// cleanMSSQLSyntax converts nvarchar(max) → nvarchar(4000) for parser compatibility
		expect(findCol(users, 'PasswordHash').type).toBe('VARCHAR');
		expect(findCol(users, 'SecurityStamp').type).toBe('VARCHAR');
	});
});

// ═══════════════════════════════════════════════════════════════════
// MSSQL — Spring Session (bracket identifiers)
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Spring Session (MSSQL)', () => {
	const SPRING_SESSION_MSSQL = `
CREATE TABLE [SPRING_SESSION] (
  [PRIMARY_ID] CHAR(36) NOT NULL,
  [SESSION_ID] CHAR(36) NOT NULL,
  [CREATION_TIME] BIGINT NOT NULL,
  [LAST_ACCESS_TIME] BIGINT NOT NULL,
  [MAX_INACTIVE_INTERVAL] INT NOT NULL,
  [EXPIRY_TIME] BIGINT NOT NULL,
  [PRINCIPAL_NAME] NVARCHAR(100),
  CONSTRAINT [SPRING_SESSION_PK] PRIMARY KEY ([PRIMARY_ID])
);

CREATE UNIQUE INDEX [SPRING_SESSION_IX1] ON [SPRING_SESSION] ([SESSION_ID]);
CREATE INDEX [SPRING_SESSION_IX2] ON [SPRING_SESSION] ([EXPIRY_TIME]);
CREATE INDEX [SPRING_SESSION_IX3] ON [SPRING_SESSION] ([PRINCIPAL_NAME]);

CREATE TABLE [SPRING_SESSION_ATTRIBUTES] (
  [SESSION_PRIMARY_ID] CHAR(36) NOT NULL,
  [ATTRIBUTE_NAME] NVARCHAR(200) NOT NULL,
  [ATTRIBUTE_BYTES] VARBINARY(MAX) NOT NULL,
  CONSTRAINT [SPRING_SESSION_ATTRIBUTES_PK] PRIMARY KEY ([SESSION_PRIMARY_ID], [ATTRIBUTE_NAME]),
  CONSTRAINT [SPRING_SESSION_ATTRIBUTES_FK] FOREIGN KEY ([SESSION_PRIMARY_ID]) REFERENCES [SPRING_SESSION]([PRIMARY_ID]) ON DELETE CASCADE
);
`;

	it('imports 2 tables with bracket identifiers', async () => {
		const { tables, errors } = await importDDL(SPRING_SESSION_MSSQL, 'mssql');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(2);
	});

	it('FK resolved and composite PK', async () => {
		const { tables } = await importDDL(SPRING_SESSION_MSSQL, 'mssql');
		const session = findTable(tables, 'SPRING_SESSION');
		const attrs = findTable(tables, 'SPRING_SESSION_ATTRIBUTES');
		expect(pkNames(attrs).length).toBe(2);
		expect(hasFKTo(attrs, session)).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════════
// MariaDB — Spring Session
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Spring Session (MariaDB)', () => {
	const SPRING_SESSION_MARIA = `
CREATE TABLE SPRING_SESSION (
  PRIMARY_ID CHAR(36) NOT NULL,
  SESSION_ID CHAR(36) NOT NULL,
  CREATION_TIME BIGINT NOT NULL,
  LAST_ACCESS_TIME BIGINT NOT NULL,
  MAX_INACTIVE_INTERVAL INT NOT NULL,
  EXPIRY_TIME BIGINT NOT NULL,
  PRINCIPAL_NAME VARCHAR(100),
  CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
  SESSION_PRIMARY_ID CHAR(36) NOT NULL,
  ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
  ATTRIBUTE_BYTES BLOB NOT NULL,
  CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
  CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;
`;

	it('imports 2 tables via MariaDB dialect', async () => {
		const { tables, errors } = await importDDL(SPRING_SESSION_MARIA, 'mariadb');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(2);
		const session = findTable(tables, 'SPRING_SESSION');
		expect(session.columns.length).toBe(7);
	});

	it('FK with CASCADE and composite PK', async () => {
		const { tables } = await importDDL(SPRING_SESSION_MARIA, 'mariadb');
		const session = findTable(tables, 'SPRING_SESSION');
		const attrs = findTable(tables, 'SPRING_SESSION_ATTRIBUTES');
		expect(pkNames(attrs).length).toBe(2);
		const fk = findFK(attrs, session);
		expect(fk).toBeDefined();
		expect(fk!.onDelete).toBe('CASCADE');
	});
});

// ═══════════════════════════════════════════════════════════════════
// SQLite — Android Room Blog App
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Android Room (SQLite)', () => {
	const ROOM_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS index_users_username ON users (username);
CREATE UNIQUE INDEX IF NOT EXISTS index_users_email ON users (email);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  is_published INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS index_posts_author_id ON posts (author_id);
CREATE INDEX IF NOT EXISTS index_posts_category ON posts (category);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  content TEXT NOT NULL,
  post_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  parent_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS index_comments_post_id ON comments (post_id);
CREATE INDEX IF NOT EXISTS index_comments_author_id ON comments (author_id);
`;

	it('imports all 3 tables with IF NOT EXISTS', async () => {
		const { tables, errors } = await importDDL(ROOM_DDL, 'sqlite');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(3);
	});

	it('users — INTEGER PRIMARY KEY AUTOINCREMENT', async () => {
		const { tables } = await importDDL(ROOM_DDL, 'sqlite');
		const users = findTable(tables, 'users');
		expect(users.columns.length).toBe(8);
		const id = findCol(users, 'id');
		expect(id.primaryKey).toBe(true);
		expect(id.autoIncrement).toBe(true);
		expect(id.type).toBe('INT'); // INTEGER → INT
	});

	it('users — TEXT columns stay as TEXT', async () => {
		const { tables } = await importDDL(ROOM_DDL, 'sqlite');
		const users = findTable(tables, 'users');
		expect(findCol(users, 'username').type).toBe('TEXT');
		expect(findCol(users, 'email').type).toBe('TEXT');
	});

	it('posts — FK to users with CASCADE', async () => {
		const { tables } = await importDDL(ROOM_DDL, 'sqlite');
		const posts = findTable(tables, 'posts');
		const users = findTable(tables, 'users');
		expect(hasFKTo(posts, users)).toBe(true);
		const fk = findFK(posts, users);
		expect(fk!.onDelete).toBe('CASCADE');
	});

	it('comments — 2 FKs (post + author)', async () => {
		const { tables } = await importDDL(ROOM_DDL, 'sqlite');
		const comments = findTable(tables, 'comments');
		const posts = findTable(tables, 'posts');
		const users = findTable(tables, 'users');
		expect(comments.foreignKeys.length).toBe(2);
		expect(hasFKTo(comments, posts)).toBe(true);
		expect(hasFKTo(comments, users)).toBe(true);
	});

	it('CREATE UNIQUE INDEX marks columns unique', async () => {
		const { tables } = await importDDL(ROOM_DDL, 'sqlite');
		const users = findTable(tables, 'users');
		// unique index may mark column or be in indexes
		expect(
			findCol(users, 'username').unique || hasIndexOn(users, 'username')
		).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════════
// Oracle — HR Sample Schema (inline PK + ALTER TABLE FK + COMMENT ON)
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Oracle HR Schema', () => {
	const ORACLE_HR = `
CREATE TABLE regions (
  region_id DECIMAL(10) NOT NULL,
  region_name VARCHAR(25),
  CONSTRAINT reg_id_pk PRIMARY KEY (region_id)
);

CREATE TABLE countries (
  country_id CHAR(2) NOT NULL,
  country_name VARCHAR(40),
  region_id DECIMAL(10),
  CONSTRAINT country_c_id_pk PRIMARY KEY (country_id)
);

ALTER TABLE countries ADD CONSTRAINT countr_reg_fk FOREIGN KEY (region_id) REFERENCES regions (region_id);

CREATE TABLE locations (
  location_id DECIMAL(4) NOT NULL,
  street_address VARCHAR(40),
  postal_code VARCHAR(12),
  city VARCHAR(30) NOT NULL,
  state_province VARCHAR(25),
  country_id CHAR(2),
  CONSTRAINT loc_id_pk PRIMARY KEY (location_id)
);

ALTER TABLE locations ADD CONSTRAINT loc_c_id_fk FOREIGN KEY (country_id) REFERENCES countries (country_id);

CREATE TABLE departments (
  department_id DECIMAL(4) NOT NULL,
  department_name VARCHAR(30) NOT NULL,
  manager_id DECIMAL(6),
  location_id DECIMAL(4),
  CONSTRAINT dept_id_pk PRIMARY KEY (department_id)
);

ALTER TABLE departments ADD CONSTRAINT dept_loc_fk FOREIGN KEY (location_id) REFERENCES locations (location_id);

CREATE TABLE jobs (
  job_id VARCHAR(10) NOT NULL,
  job_title VARCHAR(35) NOT NULL,
  min_salary DECIMAL(6),
  max_salary DECIMAL(6),
  CONSTRAINT job_id_pk PRIMARY KEY (job_id)
);

CREATE TABLE employees (
  employee_id DECIMAL(6) NOT NULL,
  first_name VARCHAR(20),
  last_name VARCHAR(25) NOT NULL,
  email VARCHAR(25) NOT NULL,
  phone_number VARCHAR(20),
  hire_date DATE NOT NULL,
  job_id VARCHAR(10) NOT NULL,
  salary DECIMAL(8,2),
  commission_pct DECIMAL(2,2),
  manager_id DECIMAL(6),
  department_id DECIMAL(4),
  CONSTRAINT emp_emp_id_pk PRIMARY KEY (employee_id)
);

ALTER TABLE employees ADD CONSTRAINT emp_dept_fk FOREIGN KEY (department_id) REFERENCES departments (department_id);
ALTER TABLE employees ADD CONSTRAINT emp_job_fk FOREIGN KEY (job_id) REFERENCES jobs (job_id);
ALTER TABLE employees ADD CONSTRAINT emp_manager_fk FOREIGN KEY (manager_id) REFERENCES employees (employee_id);

CREATE TABLE job_history (
  employee_id DECIMAL(6) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  job_id VARCHAR(10) NOT NULL,
  department_id DECIMAL(4),
  CONSTRAINT jhist_emp_id_st_date_pk PRIMARY KEY (employee_id, start_date)
);

ALTER TABLE job_history ADD CONSTRAINT jhist_job_fk FOREIGN KEY (job_id) REFERENCES jobs (job_id);
ALTER TABLE job_history ADD CONSTRAINT jhist_emp_fk FOREIGN KEY (employee_id) REFERENCES employees (employee_id);
ALTER TABLE job_history ADD CONSTRAINT jhist_dept_fk FOREIGN KEY (department_id) REFERENCES departments (department_id);

COMMENT ON TABLE regions IS 'Regions table containing region names.';
COMMENT ON COLUMN regions.region_id IS 'Primary key of regions table.';
COMMENT ON COLUMN regions.region_name IS 'Names of regions.';
COMMENT ON TABLE employees IS 'Contains details of employees.';
COMMENT ON COLUMN employees.salary IS 'Monthly salary of the employee.';
`;

	it('imports all 7 tables', async () => {
		const { tables, errors } = await importDDL(ORACLE_HR, 'oracle');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(7);
	});

	it('regions — DECIMAL type, VARCHAR type', async () => {
		const { tables } = await importDDL(ORACLE_HR, 'oracle');
		const regions = findTable(tables, 'regions');
		expect(findCol(regions, 'region_id').type).toBe('DECIMAL');
		expect(findCol(regions, 'region_name').type).toBe('VARCHAR');
	});

	it('employees — 11 columns, multiple types', async () => {
		const { tables } = await importDDL(ORACLE_HR, 'oracle');
		const emp = findTable(tables, 'employees');
		expect(emp.columns.length).toBe(11);
		expect(findCol(emp, 'hire_date').type).toBe('DATE');
		expect(findCol(emp, 'salary').type).toBe('DECIMAL');
		expect(findCol(emp, 'email').type).toBe('VARCHAR');
	});

	it('ALTER TABLE FK — employees → departments, jobs, self-ref', async () => {
		const { tables } = await importDDL(ORACLE_HR, 'oracle');
		const emp = findTable(tables, 'employees');
		const dept = findTable(tables, 'departments');
		const jobs = findTable(tables, 'jobs');

		// Oracle ALTER TABLE FK is parsed through PG parser
		expect(hasFKTo(emp, dept)).toBe(true);
		expect(hasFKTo(emp, jobs)).toBe(true);
		// self-referencing FK (manager → employee)
		const selfFk = emp.foreignKeys.find((fk) => fk.referencedTableId === emp.id);
		expect(selfFk).toBeDefined();
	});

	it('job_history — composite PK and 3 FKs', async () => {
		const { tables } = await importDDL(ORACLE_HR, 'oracle');
		const jh = findTable(tables, 'job_history');
		expect(pkNames(jh).length).toBe(2);
		expect(pkNames(jh)).toContain('employee_id');
		expect(pkNames(jh)).toContain('start_date');
		expect(jh.foreignKeys.length).toBe(3);
	});

	it('countries → regions FK', async () => {
		const { tables } = await importDDL(ORACLE_HR, 'oracle');
		const countries = findTable(tables, 'countries');
		const regions = findTable(tables, 'regions');
		expect(hasFKTo(countries, regions)).toBe(true);
	});

	it('COMMENT ON extracted for tables and columns', async () => {
		const { tables } = await importDDL(ORACLE_HR, 'oracle');
		const regions = findTable(tables, 'regions');
		expect(regions.comment).toBe('Regions table containing region names.');
		expect(findCol(regions, 'region_id').comment).toBe('Primary key of regions table.');

		const emp = findTable(tables, 'employees');
		expect(emp.comment).toBe('Contains details of employees.');
		expect(findCol(emp, 'salary').comment).toBe('Monthly salary of the employee.');
	});
});

// ═══════════════════════════════════════════════════════════════════
// Oracle — Spring Session
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Spring Session (Oracle)', () => {
	const SPRING_SESSION_ORACLE = `
CREATE TABLE SPRING_SESSION (
  PRIMARY_ID CHAR(36) NOT NULL,
  SESSION_ID CHAR(36) NOT NULL,
  CREATION_TIME DECIMAL(19,0) NOT NULL,
  LAST_ACCESS_TIME DECIMAL(19,0) NOT NULL,
  MAX_INACTIVE_INTERVAL DECIMAL(10,0) NOT NULL,
  EXPIRY_TIME DECIMAL(19,0) NOT NULL,
  PRINCIPAL_NAME VARCHAR(100),
  CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
  SESSION_PRIMARY_ID CHAR(36) NOT NULL,
  ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
  ATTRIBUTE_BYTES TEXT NOT NULL,
  CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
  CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
);
`;

	it('imports 2 tables with DECIMAL types', async () => {
		const { tables, errors } = await importDDL(SPRING_SESSION_ORACLE, 'oracle');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(2);
		const session = findTable(tables, 'SPRING_SESSION');
		expect(findCol(session, 'CREATION_TIME').type).toBe('DECIMAL');
		expect(findCol(session, 'PRINCIPAL_NAME').type).toBe('VARCHAR');
	});

	it('FK with ON DELETE CASCADE', async () => {
		const { tables } = await importDDL(SPRING_SESSION_ORACLE, 'oracle');
		const session = findTable(tables, 'SPRING_SESSION');
		const attrs = findTable(tables, 'SPRING_SESSION_ATTRIBUTES');
		const fk = findFK(attrs, session);
		expect(fk).toBeDefined();
		expect(fk!.onDelete).toBe('CASCADE');
	});
});

// ═══════════════════════════════════════════════════════════════════
// Oracle — with GENERATED AS IDENTITY
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Oracle IDENTITY columns', () => {
	const ORACLE_IDENTITY = `
CREATE TABLE audit_log (
  log_id DECIMAL(19) GENERATED ALWAYS AS IDENTITY,
  event_type VARCHAR(50) NOT NULL,
  event_data TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  user_id DECIMAL(10),
  CONSTRAINT audit_log_pk PRIMARY KEY (log_id)
);

CREATE TABLE categories (
  category_id DECIMAL(10) GENERATED BY DEFAULT AS IDENTITY,
  name VARCHAR(100) NOT NULL,
  parent_id DECIMAL(10),
  CONSTRAINT categories_pk PRIMARY KEY (category_id)
);

ALTER TABLE categories ADD CONSTRAINT cat_parent_fk FOREIGN KEY (parent_id) REFERENCES categories (category_id);

COMMENT ON TABLE audit_log IS 'System audit trail';
COMMENT ON COLUMN audit_log.event_type IS 'Type of audit event';
`;

	it('IDENTITY columns marked as autoIncrement', async () => {
		const { tables, errors } = await importDDL(ORACLE_IDENTITY, 'oracle');
		expect(errors).toHaveLength(0);

		const audit = findTable(tables, 'audit_log');
		expect(findCol(audit, 'log_id').autoIncrement).toBe(true);
		expect(findCol(audit, 'log_id').type).toBe('DECIMAL');

		const cats = findTable(tables, 'categories');
		expect(findCol(cats, 'category_id').autoIncrement).toBe(true);
	});

	it('TEXT and TIMESTAMP types preserved', async () => {
		const { tables } = await importDDL(ORACLE_IDENTITY, 'oracle');
		const audit = findTable(tables, 'audit_log');
		expect(findCol(audit, 'event_data').type).toBe('TEXT');
		expect(findCol(audit, 'created_at').type).toBe('TIMESTAMP');
	});

	it('comments extracted', async () => {
		const { tables } = await importDDL(ORACLE_IDENTITY, 'oracle');
		const audit = findTable(tables, 'audit_log');
		expect(audit.comment).toBe('System audit trail');
		expect(findCol(audit, 'event_type').comment).toBe('Type of audit event');
	});

	it('self-referencing FK on categories', async () => {
		const { tables } = await importDDL(ORACLE_IDENTITY, 'oracle');
		const cats = findTable(tables, 'categories');
		const selfFk = cats.foreignKeys.find((fk) => fk.referencedTableId === cats.id);
		expect(selfFk).toBeDefined();
	});
});

// ═══════════════════════════════════════════════════════════════════
// H2 — Spring Batch (IDENTITY + CLOB)
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Spring Batch (H2)', () => {
	const SPRING_BATCH_H2 = `
CREATE TABLE BATCH_JOB_INSTANCE (
  JOB_INSTANCE_ID BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  VERSION BIGINT,
  JOB_NAME VARCHAR(100) NOT NULL,
  JOB_KEY VARCHAR(32) NOT NULL,
  CONSTRAINT JOB_INST_UN UNIQUE (JOB_NAME, JOB_KEY)
);

CREATE TABLE BATCH_JOB_EXECUTION (
  JOB_EXECUTION_ID BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  VERSION BIGINT,
  JOB_INSTANCE_ID BIGINT NOT NULL,
  CREATE_TIME TIMESTAMP NOT NULL,
  START_TIME TIMESTAMP DEFAULT NULL,
  END_TIME TIMESTAMP DEFAULT NULL,
  STATUS VARCHAR(10),
  EXIT_CODE VARCHAR(2500),
  EXIT_MESSAGE VARCHAR(2500),
  LAST_UPDATED TIMESTAMP,
  CONSTRAINT JOB_INST_EXEC_FK FOREIGN KEY (JOB_INSTANCE_ID) REFERENCES BATCH_JOB_INSTANCE(JOB_INSTANCE_ID)
);

CREATE TABLE BATCH_JOB_EXECUTION_PARAMS (
  JOB_EXECUTION_ID BIGINT NOT NULL,
  PARAMETER_NAME VARCHAR(100) NOT NULL,
  PARAMETER_TYPE VARCHAR(100) NOT NULL,
  PARAMETER_VALUE VARCHAR(2500),
  IDENTIFYING CHAR(1) NOT NULL,
  CONSTRAINT JOB_EXEC_PARAMS_FK FOREIGN KEY (JOB_EXECUTION_ID) REFERENCES BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
);

CREATE TABLE BATCH_STEP_EXECUTION (
  STEP_EXECUTION_ID BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  VERSION BIGINT NOT NULL,
  STEP_NAME VARCHAR(100) NOT NULL,
  JOB_EXECUTION_ID BIGINT NOT NULL,
  CREATE_TIME TIMESTAMP NOT NULL,
  START_TIME TIMESTAMP DEFAULT NULL,
  END_TIME TIMESTAMP DEFAULT NULL,
  STATUS VARCHAR(10),
  COMMIT_COUNT BIGINT,
  READ_COUNT BIGINT,
  FILTER_COUNT BIGINT,
  WRITE_COUNT BIGINT,
  READ_SKIP_COUNT BIGINT,
  WRITE_SKIP_COUNT BIGINT,
  PROCESS_SKIP_COUNT BIGINT,
  ROLLBACK_COUNT BIGINT,
  EXIT_CODE VARCHAR(2500),
  EXIT_MESSAGE VARCHAR(2500),
  LAST_UPDATED TIMESTAMP,
  CONSTRAINT JOB_EXEC_STEP_FK FOREIGN KEY (JOB_EXECUTION_ID) REFERENCES BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
);

CREATE TABLE BATCH_STEP_EXECUTION_CONTEXT (
  STEP_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
  SHORT_CONTEXT VARCHAR(2500) NOT NULL,
  SERIALIZED_CONTEXT TEXT,
  CONSTRAINT STEP_EXEC_CTX_FK FOREIGN KEY (STEP_EXECUTION_ID) REFERENCES BATCH_STEP_EXECUTION(STEP_EXECUTION_ID)
);

CREATE TABLE BATCH_JOB_EXECUTION_CONTEXT (
  JOB_EXECUTION_ID BIGINT NOT NULL PRIMARY KEY,
  SHORT_CONTEXT VARCHAR(2500) NOT NULL,
  SERIALIZED_CONTEXT TEXT,
  CONSTRAINT JOB_EXEC_CTX_FK FOREIGN KEY (JOB_EXECUTION_ID) REFERENCES BATCH_JOB_EXECUTION(JOB_EXECUTION_ID)
);
`;

	it('imports all 6 tables', async () => {
		const { tables, errors } = await importDDL(SPRING_BATCH_H2, 'h2');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(6);
	});

	it('IDENTITY columns marked as autoIncrement', async () => {
		const { tables } = await importDDL(SPRING_BATCH_H2, 'h2');
		const inst = findTable(tables, 'BATCH_JOB_INSTANCE');
		expect(findCol(inst, 'JOB_INSTANCE_ID').autoIncrement).toBe(true);
		expect(findCol(inst, 'JOB_INSTANCE_ID').type).toBe('BIGINT');

		const exec = findTable(tables, 'BATCH_JOB_EXECUTION');
		expect(findCol(exec, 'JOB_EXECUTION_ID').autoIncrement).toBe(true);
	});

	it('TIMESTAMP columns preserved', async () => {
		const { tables } = await importDDL(SPRING_BATCH_H2, 'h2');
		const exec = findTable(tables, 'BATCH_JOB_EXECUTION');
		expect(findCol(exec, 'CREATE_TIME').type).toBe('TIMESTAMP');
	});

	it('FK chain fully resolved', async () => {
		const { tables } = await importDDL(SPRING_BATCH_H2, 'h2');
		const inst = findTable(tables, 'BATCH_JOB_INSTANCE');
		const exec = findTable(tables, 'BATCH_JOB_EXECUTION');
		const step = findTable(tables, 'BATCH_STEP_EXECUTION');

		expect(hasFKTo(exec, inst)).toBe(true);
		expect(hasFKTo(step, exec)).toBe(true);
	});

	it('composite unique on (JOB_NAME, JOB_KEY)', async () => {
		const { tables } = await importDDL(SPRING_BATCH_H2, 'h2');
		const inst = findTable(tables, 'BATCH_JOB_INSTANCE');
		expect(hasUniqueKey(inst, ['JOB_NAME', 'JOB_KEY'])).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════════
// H2 — Hibernate/JPA E-commerce (COMMENT ON + DECIMAL + BOOLEAN)
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Hibernate/JPA E-commerce (H2)', () => {
	const HIBERNATE_H2 = `
CREATE TABLE customers (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_customers_email UNIQUE (email)
);

COMMENT ON TABLE customers IS 'Customer master data';
COMMENT ON COLUMN customers.email IS 'Unique email address';

CREATE TABLE products (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  sku VARCHAR(50) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_products_sku UNIQUE (sku)
);

COMMENT ON TABLE products IS 'Product catalog';

CREATE TABLE orders (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  shipping_address TEXT,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
);

CREATE TABLE order_items (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (id)
);
`;

	it('imports all 4 tables', async () => {
		const { tables, errors } = await importDDL(HIBERNATE_H2, 'h2');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(4);
	});

	it('customers — IDENTITY, UNIQUE email, COMMENT', async () => {
		const { tables } = await importDDL(HIBERNATE_H2, 'h2');
		const cust = findTable(tables, 'customers');
		expect(findCol(cust, 'id').autoIncrement).toBe(true);
		expect(findCol(cust, 'email').unique).toBe(true);
		expect(cust.comment).toBe('Customer master data');
		expect(findCol(cust, 'email').comment).toBe('Unique email address');
	});

	it('products — TEXT, DECIMAL, BOOLEAN types', async () => {
		const { tables } = await importDDL(HIBERNATE_H2, 'h2');
		const prod = findTable(tables, 'products');
		expect(findCol(prod, 'description').type).toBe('TEXT');
		expect(findCol(prod, 'price').type).toBe('DECIMAL');
		expect(findCol(prod, 'active').type).toBe('BOOLEAN');
		expect(findCol(prod, 'sku').unique).toBe(true);
		expect(prod.comment).toBe('Product catalog');
	});

	it('orders — FK to customers', async () => {
		const { tables } = await importDDL(HIBERNATE_H2, 'h2');
		const orders = findTable(tables, 'orders');
		const cust = findTable(tables, 'customers');
		expect(hasFKTo(orders, cust)).toBe(true);
	});

	it('order_items — 2 FKs, CASCADE on order delete', async () => {
		const { tables } = await importDDL(HIBERNATE_H2, 'h2');
		const items = findTable(tables, 'order_items');
		const orders = findTable(tables, 'orders');
		const products = findTable(tables, 'products');
		expect(items.foreignKeys.length).toBe(2);

		const orderFk = findFK(items, orders);
		expect(orderFk?.onDelete).toBe('CASCADE');
		expect(hasFKTo(items, products)).toBe(true);
	});
});

// ═══════════════════════════════════════════════════════════════════
// Cross-dialect: same Spring Session schema across 4+ dialects
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Cross-dialect Spring Session consistency', () => {
	it('all dialects produce same table/column structure', async () => {
		const mysql = `
CREATE TABLE SPRING_SESSION (
  PRIMARY_ID CHAR(36) NOT NULL,
  SESSION_ID CHAR(36) NOT NULL,
  CREATION_TIME BIGINT NOT NULL,
  MAX_INACTIVE_INTERVAL INT NOT NULL,
  PRINCIPAL_NAME VARCHAR(100),
  CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
) ENGINE=InnoDB;
`;
		const pg = `
CREATE TABLE SPRING_SESSION (
  PRIMARY_ID CHAR(36) NOT NULL,
  SESSION_ID CHAR(36) NOT NULL,
  CREATION_TIME BIGINT NOT NULL,
  MAX_INACTIVE_INTERVAL INT NOT NULL,
  PRINCIPAL_NAME VARCHAR(100),
  CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);
`;
		const h2 = `
CREATE TABLE SPRING_SESSION (
  PRIMARY_ID CHAR(36) NOT NULL,
  SESSION_ID CHAR(36) NOT NULL,
  CREATION_TIME BIGINT NOT NULL,
  MAX_INACTIVE_INTERVAL INT NOT NULL,
  PRINCIPAL_NAME VARCHAR(100),
  CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);
`;

		const [r1, r2, r3] = await Promise.all([
			importDDL(mysql, 'mysql'),
			importDDL(pg, 'postgresql'),
			importDDL(h2, 'h2'),
		]);

		// All should import successfully
		[r1, r2, r3].forEach((r) => {
			expect(r.errors).toHaveLength(0);
			expect(r.tables).toHaveLength(1);
		});

		// All tables should have same column count and names
		const colNames = [r1, r2, r3].map((r) =>
			r.tables[0].columns.map((c) => c.name).sort()
		);
		expect(colNames[0]).toEqual(colNames[1]);
		expect(colNames[1]).toEqual(colNames[2]);

		// PK should be consistent
		[r1, r2, r3].forEach((r) => {
			expect(pkNames(r.tables[0])).toEqual(['PRIMARY_ID']);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════
// Round-trip: Export-style DDL → Import
// ═══════════════════════════════════════════════════════════════════
describe('Integration: DDL Export → Import round-trip', () => {
	it('MySQL — re-import exported-style DDL', async () => {
		const exportedDDL = `
CREATE TABLE \`users\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`name\` VARCHAR(255) NOT NULL,
  \`email\` VARCHAR(255) NOT NULL,
  \`active\` BOOLEAN DEFAULT true,
  \`created_at\` DATETIME NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY (\`email\`)
) ENGINE=InnoDB;

CREATE TABLE \`posts\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`title\` VARCHAR(255) NOT NULL,
  \`body\` TEXT NOT NULL,
  \`author_id\` BIGINT NOT NULL,
  \`published\` BOOLEAN DEFAULT false,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;

ALTER TABLE \`posts\` ADD CONSTRAINT \`fk_posts_author\` FOREIGN KEY (\`author_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION;
`;
		const { tables, errors } = await importDDL(exportedDDL, 'mysql');
		expect(errors).toHaveLength(0);
		expect(tables).toHaveLength(2);

		const users = findTable(tables, 'users');
		expect(findCol(users, 'id').autoIncrement).toBe(true);
		expect(findCol(users, 'email').unique).toBe(true);

		const posts = findTable(tables, 'posts');
		expect(hasFKTo(posts, users)).toBe(true);
		const fk = findFK(posts, users);
		expect(fk!.onDelete).toBe('CASCADE');
	});

	it('PostgreSQL — re-import with COMMENT ON', async () => {
		const exportedDDL = `
CREATE TABLE "users" (
  "id" BIGSERIAL NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("email")
);

COMMENT ON TABLE "users" IS 'Application users';
COMMENT ON COLUMN "users"."email" IS 'Must be unique';
`;
		const { tables, errors } = await importDDL(exportedDDL, 'postgresql');
		expect(errors).toHaveLength(0);
		const users = findTable(tables, 'users');
		expect(users.comment).toBe('Application users');
		expect(findCol(users, 'email').comment).toBe('Must be unique');
		expect(findCol(users, 'id').autoIncrement).toBe(true);
	});
});

// ─── erdmini own schema (SQLite) ───────────────────────────────
describe('Integration: erdmini own schema (SQLite)', () => {
	const DDL = `
create table main.canvas_states
(
    project_id TEXT
        primary key,
    data       TEXT not null
);

create table main.oidc_providers
(
    id                TEXT
        primary key,
    display_name      TEXT              not null,
    issuer_url        TEXT              not null,
    client_id         TEXT              not null,
    client_secret     TEXT              not null,
    scopes            TEXT    default 'openid email profile',
    enabled           INTEGER default 1 not null,
    auto_create_users INTEGER default 1 not null,
    created_at        TEXT    default (datetime('now'))
);

create table main.oidc_states
(
    state         TEXT
        primary key,
    provider_id   TEXT not null,
    code_verifier TEXT not null,
    redirect_uri  TEXT not null,
    expires_at    TEXT not null
);

create table main.project_index
(
    id      TEXT default 'singleton'
        primary key,
    data    TEXT not null,
    user_id TEXT default 'singleton'
);

create table main.project_permissions
(
    id         TEXT
        primary key,
    project_id TEXT                  not null,
    user_id    TEXT                  not null,
    permission TEXT default 'viewer' not null,
    created_at TEXT default (datetime('now')),
    unique (project_id, user_id)
);

create table main.schemas
(
    project_id TEXT
        primary key,
    data       TEXT not null,
    updated_at TEXT default (datetime('now'))
);

create table main.sqlite_master
(
    type     TEXT,
    name     TEXT,
    tbl_name TEXT,
    rootpage INT,
    sql      TEXT
);

create table main.users
(
    id            TEXT
        primary key,
    username      TEXT
        unique,
    display_name  TEXT                not null,
    email         TEXT,
    password_hash TEXT,
    role          TEXT default 'user' not null,
    created_at    TEXT default (datetime('now')),
    updated_at    TEXT default (datetime('now'))
);

create table main.oidc_identities
(
    id          TEXT
        primary key,
    user_id     TEXT not null
        references main.users
            on delete cascade,
    provider_id TEXT not null
        references main.oidc_providers
            on delete cascade,
    subject     TEXT not null,
    email       TEXT,
    unique (provider_id, subject)
);

create table main.sessions
(
    id         TEXT
        primary key,
    user_id    TEXT not null
        references main.users
            on delete cascade,
    expires_at TEXT not null,
    created_at TEXT default (datetime('now'))
);
`;

	let tables: Table[];

	it('should parse without errors', async () => {
		const result = await importDDL(DDL, 'sqlite');
		tables = result.tables;
		expect(result.errors).toEqual([]);
		expect(tables.map(t => t.name)).toContain('users');
		expect(tables.map(t => t.name)).toContain('oidc_identities');
		expect(tables.map(t => t.name)).toContain('sessions');
		expect(tables.length).toBeGreaterThanOrEqual(9);
	});

	it('should strip main. schema prefix', async () => {
		const result = await importDDL(DDL, 'sqlite');
		tables = result.tables;
		for (const t of tables) {
			expect(t.schema).toBeUndefined();
		}
	});

	it('should parse users table correctly', async () => {
		const result = await importDDL(DDL, 'sqlite');
		tables = result.tables;
		const users = findTable(tables, 'users');
		expect(pkNames(users)).toEqual(['id']);
		expect(findCol(users, 'username').unique).toBe(true);
		expect(findCol(users, 'display_name').nullable).toBe(false);
		expect(findCol(users, 'email').nullable).toBe(true);
	});

	it('should resolve inline FK references', async () => {
		const result = await importDDL(DDL, 'sqlite');
		tables = result.tables;
		const identities = findTable(tables, 'oidc_identities');
		const users = findTable(tables, 'users');
		const providers = findTable(tables, 'oidc_providers');
		expect(hasFKTo(identities, users)).toBe(true);
		expect(hasFKTo(identities, providers)).toBe(true);
		const userFK = identities.foreignKeys.find((fk) => fk.referencedTableId === users.id);
		expect(userFK?.onDelete).toBe('CASCADE');
	});

	it('should parse sessions FK', async () => {
		const result = await importDDL(DDL, 'sqlite');
		tables = result.tables;
		const sessions = findTable(tables, 'sessions');
		const users = findTable(tables, 'users');
		expect(hasFKTo(sessions, users)).toBe(true);
	});

	it('should parse composite unique constraint', async () => {
		const result = await importDDL(DDL, 'sqlite');
		tables = result.tables;
		const perms = findTable(tables, 'project_permissions');
		expect(perms.uniqueKeys.length).toBeGreaterThanOrEqual(1);
		const compositeUK = perms.uniqueKeys.find((uk) => uk.columnIds.length === 2);
		expect(compositeUK).toBeDefined();
	});
});

// ═══════════════════════════════════════════════════════════════════
// #35 DDL Export Quality — PostgreSQL ENUM round-trip
// ═══════════════════════════════════════════════════════════════════
describe('Integration: PostgreSQL ENUM export + MySQL ENUM round-trip', () => {
	// Build schema in-memory (ENUM columns with enumValues)
	function enumSchema(): ERDSchema {
		return toSchema([
			{
				id: 't1', name: 'orders', position: { x: 0, y: 0 }, columns: [
					{ id: 'c1', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: false, autoIncrement: true },
					{ id: 'c2', name: 'customer_name', type: 'VARCHAR', length: 200, nullable: false, primaryKey: false, unique: false, autoIncrement: false },
					{ id: 'c3', name: 'status', type: 'ENUM', enumValues: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], nullable: false, primaryKey: false, unique: false, autoIncrement: false },
					{ id: 'c4', name: 'priority', type: 'ENUM', enumValues: ['low', 'medium', 'high', 'critical'], nullable: true, primaryKey: false, unique: false, autoIncrement: false },
				], foreignKeys: [], uniqueKeys: [], indexes: [],
			},
		]);
	}

	it('PG export generates CREATE TYPE ... AS ENUM before CREATE TABLE', () => {
		const ddl = exportDDL(enumSchema(), 'postgresql');
		expect(ddl).toContain("CREATE TYPE \"orders_status_enum\" AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');");
		expect(ddl).toContain("CREATE TYPE \"orders_priority_enum\" AS ENUM ('low', 'medium', 'high', 'critical');");
		expect(ddl.indexOf('CREATE TYPE')).toBeLessThan(ddl.indexOf('CREATE TABLE'));
		// Column references enum type name (not VARCHAR)
		expect(ddl).toContain('orders_status_enum');
		expect(ddl).not.toContain('VARCHAR(255)');
	});

	it('MySQL export uses inline ENUM() — not CREATE TYPE', () => {
		const mysqlDDL = exportDDL(enumSchema(), 'mysql');
		expect(mysqlDDL).not.toContain('CREATE TYPE');
		expect(mysqlDDL).toContain("ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled')");
	});

	it('MySQL ENUM round-trip: export → import preserves ENUM type', async () => {
		const mysqlDDL = exportDDL(enumSchema(), 'mysql');
		const reimported = await importDDL(mysqlDDL, 'mysql');
		expect(reimported.errors).toHaveLength(0);

		const orders = findTable(reimported.tables, 'orders');
		const status = findCol(orders, 'status');
		expect(status.type).toBe('ENUM');
		// Note: DDL importer currently doesn't extract ENUM values from inline ENUM('a','b')
		// enumValues extraction is a separate enhancement

		const priority = findCol(orders, 'priority');
		expect(priority.type).toBe('ENUM');
	});

	it('MSSQL/Oracle export falls back to NVARCHAR/VARCHAR2 for ENUM', () => {
		const mssqlDDL = exportDDL(enumSchema(), 'mssql');
		expect(mssqlDDL).not.toContain('CREATE TYPE');
		expect(mssqlDDL).toContain('NVARCHAR(255)');

		const oracleDDL = exportDDL(enumSchema(), 'oracle');
		expect(oracleDDL).not.toContain('CREATE TYPE');
		expect(oracleDDL).toContain('VARCHAR2(255)');
	});
});

// ═══════════════════════════════════════════════════════════════════
// #35 DDL Export Quality — DATETIME preservation round-trip
// ═══════════════════════════════════════════════════════════════════
describe('Integration: DATETIME preservation', () => {
	it('MySQL DATETIME columns preserved on import', async () => {
		const DDL = `
CREATE TABLE events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_name VARCHAR(200) NOT NULL,
  start_date DATETIME NOT NULL,
  end_date DATETIME,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
`;
		const { tables } = await importDDL(DDL, 'mysql');
		const events = findTable(tables, 'events');
		// DATETIME preserved as DATETIME, TIMESTAMP stays TIMESTAMP
		expect(findCol(events, 'start_date').type).toBe('DATETIME');
		expect(findCol(events, 'end_date').type).toBe('DATETIME');
		expect(findCol(events, 'created_at').type).toBe('TIMESTAMP');

		// Export to MySQL → DATETIME columns remain DATETIME (MySQL supports it natively)
		const schema = toSchema(tables);
		const exported = exportDDL(schema, 'mysql');
		expect(exported).toContain('DATETIME');
	});

	it('MySQL DATETIME round-trip: export → re-import preserves type', async () => {
		// Build DATETIME schema in-memory for clean round-trip
		const schema = toSchema([{
			id: 't1', name: 'events', position: { x: 0, y: 0 }, foreignKeys: [], uniqueKeys: [], indexes: [],
			columns: [
				{ id: 'c1', name: 'id', type: 'BIGINT', nullable: false, primaryKey: true, unique: false, autoIncrement: true },
				{ id: 'c2', name: 'start_date', type: 'DATETIME', nullable: false, primaryKey: false, unique: false, autoIncrement: false },
				{ id: 'c3', name: 'created_at', type: 'TIMESTAMP', nullable: false, primaryKey: false, unique: false, autoIncrement: false },
			],
		}]);
		const exported = exportDDL(schema, 'mysql');
		expect(exported).toContain('DATETIME');
		const reimported = await importDDL(exported, 'mysql');
		expect(reimported.tables).toHaveLength(1);
		expect(findCol(findTable(reimported.tables, 'events'), 'start_date').type).toBe('DATETIME');
	});

	it('MSSQL DATETIME2 maps to DATETIME (preprocessed to datetime)', async () => {
		const DDL = `
CREATE TABLE [dbo].[logs] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [message] NVARCHAR(500),
  [logged_at] DATETIME2 NOT NULL,
  CONSTRAINT [PK_logs] PRIMARY KEY ([id])
)
GO
`;
		const { tables } = await importDDL(DDL, 'mssql');
		// MSSQL preprocessor converts DATETIME2 → datetime, then normalizeType maps datetime → DATETIME
		expect(findCol(findTable(tables, 'logs'), 'logged_at').type).toBe('DATETIME');
	});

	it('PostgreSQL export converts DATETIME to TIMESTAMP', () => {
		// Build schema with DATETIME column directly (PG doesn't natively support DATETIME in DDL)
		const schema = toSchema([{
			id: 't1', name: 'calendar', position: { x: 0, y: 0 }, foreignKeys: [], uniqueKeys: [], indexes: [],
			columns: [
				{ id: 'c1', name: 'id', type: 'INT', nullable: false, primaryKey: true, unique: false, autoIncrement: true },
				{ id: 'c2', name: 'event_date', type: 'DATETIME', nullable: false, primaryKey: false, unique: false, autoIncrement: false },
				{ id: 'c3', name: 'reminder_at', type: 'TIMESTAMP', nullable: true, primaryKey: false, unique: false, autoIncrement: false },
			],
		}]);
		const exported = exportDDL(schema, 'postgresql');
		// PG export maps DATETIME → TIMESTAMP
		expect(exported).toContain('TIMESTAMP');
		expect(exported).not.toContain('DATETIME');
	});
});

// ═══════════════════════════════════════════════════════════════════
// #35 DDL Export Quality — SMALLSERIAL / BIGSERIAL round-trip
// ═══════════════════════════════════════════════════════════════════
describe('Integration: PostgreSQL SERIAL variants', () => {
	it('SERIAL/BIGSERIAL/SMALLSERIAL import → export round-trip', async () => {
		const DDL = `
CREATE TABLE counters (
  small_id SMALLSERIAL PRIMARY KEY,
  normal_id SERIAL NOT NULL,
  big_id BIGSERIAL NOT NULL
);
`;
		const { tables, errors } = await importDDL(DDL, 'postgresql');
		expect(errors).toHaveLength(0);
		const t = findTable(tables, 'counters');
		expect(findCol(t, 'small_id').type).toBe('SMALLINT');
		expect(findCol(t, 'small_id').autoIncrement).toBe(true);
		expect(findCol(t, 'normal_id').type).toBe('INT');
		expect(findCol(t, 'normal_id').autoIncrement).toBe(true);
		expect(findCol(t, 'big_id').type).toBe('BIGINT');
		expect(findCol(t, 'big_id').autoIncrement).toBe(true);

		// Export back to PG preserves SERIAL variants
		const schema = toSchema(tables);
		const exported = exportDDL(schema, 'postgresql');
		expect(exported).toContain('SMALLSERIAL');
		expect(exported).toContain('SERIAL');
		expect(exported).toContain('BIGSERIAL');
	});
});

// ═══════════════════════════════════════════════════════════════════
// #35 DDL Export Quality — MSSQL schema-aware sp_addextendedproperty
// ═══════════════════════════════════════════════════════════════════
describe('Integration: MSSQL schema in comments', () => {
	it('custom schema propagates to sp_addextendedproperty', async () => {
		const DDL = `
CREATE TABLE [sales].[invoices] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [amount] DECIMAL(12,2) NOT NULL,
  CONSTRAINT [PK_invoices] PRIMARY KEY ([id])
)
GO

EXEC sp_addextendedproperty 'MS_Description', N'Sales invoices', 'SCHEMA', 'sales', 'TABLE', 'invoices'
GO
EXEC sp_addextendedproperty 'MS_Description', N'Invoice total', 'SCHEMA', 'sales', 'TABLE', 'invoices', 'COLUMN', 'amount'
GO
`;
		const { tables, errors } = await importDDL(DDL, 'mssql');
		expect(errors).toHaveLength(0);
		const invoices = findTable(tables, 'invoices');
		expect(invoices.schema).toBe('sales');
		expect(invoices.comment).toBe('Sales invoices');

		// Export — sp_addextendedproperty should use 'sales', not 'dbo'
		const schema = toSchema(tables);
		const exported = exportDDL(schema, 'mssql');
		expect(exported).toContain("@level0name=N'sales'");
		expect(exported).not.toContain("@level0name=N'dbo'");
		expect(exported).toContain('CREATE SCHEMA');
	});

	it('default dbo schema in sp_addextendedproperty when no schema', async () => {
		const DDL = `
CREATE TABLE [products] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [name] NVARCHAR(200) NOT NULL,
  CONSTRAINT [PK_products] PRIMARY KEY ([id])
)
GO

EXEC sp_addextendedproperty 'MS_Description', N'Product catalog', 'SCHEMA', 'dbo', 'TABLE', 'products'
GO
`;
		const { tables } = await importDDL(DDL, 'mssql');
		const schema = toSchema(tables);
		const exported = exportDDL(schema, 'mssql');
		expect(exported).toContain("@level0name=N'dbo'");
	});
});

// ═══════════════════════════════════════════════════════════════════
// #35 DDL Export Quality — Schema Diff with UniqueKeys + enumValues
// ═══════════════════════════════════════════════════════════════════
describe('Integration: Schema Diff — UniqueKey + ENUM changes', () => {
	it('detects added UniqueKey via import diff', async () => {
		const DDL_V1 = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL
);
`;
		const DDL_V2 = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL,
  UNIQUE (email, username)
);
`;
		const v1 = await importDDL(DDL_V1, 'postgresql');
		const v2 = await importDDL(DDL_V2, 'postgresql');
		const s1 = toSchema(v1.tables);
		const s2 = toSchema(v2.tables);

		// Match by name since IDs differ
		const diff = diffSchemas(s1, s2);
		expect(diff.modifiedTables).toHaveLength(1);
		expect(diff.modifiedTables[0].addedUniqueKeys.length).toBeGreaterThanOrEqual(1);
	});

	it('detects enumValues change between schema versions (in-memory)', () => {
		const base = {
			id: 't1', name: 'accounts', position: { x: 0, y: 0 }, foreignKeys: [] as any[], uniqueKeys: [] as any[], indexes: [] as any[],
		};
		const s1 = toSchema([{ ...base, columns: [
			{ id: 'c1', name: 'id', type: 'INT' as const, nullable: false, primaryKey: true, unique: false, autoIncrement: true },
			{ id: 'c2', name: 'status', type: 'ENUM' as const, enumValues: ['active', 'inactive'], nullable: false, primaryKey: false, unique: false, autoIncrement: false },
		]}]);
		const s2 = toSchema([{ ...base, columns: [
			{ id: 'c1', name: 'id', type: 'INT' as const, nullable: false, primaryKey: true, unique: false, autoIncrement: true },
			{ id: 'c2', name: 'status', type: 'ENUM' as const, enumValues: ['active', 'inactive', 'suspended'], nullable: false, primaryKey: false, unique: false, autoIncrement: false },
		]}]);

		const diff = diffSchemas(s1, s2);
		expect(diff.modifiedTables).toHaveLength(1);
		const colDiff = diff.modifiedTables[0].modifiedColumns.find(c => c.columnName === 'status');
		expect(colDiff).toBeDefined();
		expect(colDiff!.changes).toContain('enumValues changed');
	});

	it('detects removed UniqueKey between schema versions', async () => {
		const DDL_V1 = `
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  UNIQUE (sku, name)
);
`;
		const DDL_V2 = `
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL
);
`;
		const v1 = await importDDL(DDL_V1, 'postgresql');
		const v2 = await importDDL(DDL_V2, 'postgresql');
		const s1 = toSchema(v1.tables);
		const s2 = toSchema(v2.tables);

		const diff = diffSchemas(s1, s2);
		expect(diff.modifiedTables).toHaveLength(1);
		expect(diff.modifiedTables[0].removedUniqueKeys.length).toBeGreaterThanOrEqual(1);
	});
});
