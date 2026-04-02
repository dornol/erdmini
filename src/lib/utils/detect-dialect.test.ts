import { describe, it, expect } from 'vitest';
import { detectDialect } from './detect-dialect';

describe('detectDialect', () => {
  it('detects MySQL by AUTO_INCREMENT', () => {
    expect(detectDialect('CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY);')).toBe('mysql');
  });

  it('detects MySQL by ENGINE=', () => {
    expect(detectDialect('CREATE TABLE t (id INT) ENGINE=InnoDB;')).toBe('mysql');
  });

  it('detects MySQL by backtick quoting', () => {
    expect(detectDialect('CREATE TABLE `users` (`id` INT PRIMARY KEY);')).toBe('mysql');
  });

  it('detects PostgreSQL by SERIAL', () => {
    expect(detectDialect('CREATE TABLE users (id SERIAL PRIMARY KEY);')).toBe('postgresql');
  });

  it('detects PostgreSQL by BIGSERIAL', () => {
    expect(detectDialect('CREATE TABLE users (id BIGSERIAL PRIMARY KEY);')).toBe('postgresql');
  });

  it('detects PostgreSQL by CREATE TYPE', () => {
    expect(detectDialect("CREATE TYPE status AS ENUM ('active', 'inactive');")).toBe('postgresql');
  });

  it('detects MSSQL by IDENTITY', () => {
    expect(detectDialect('CREATE TABLE users (id INT IDENTITY(1,1) PRIMARY KEY);')).toBe('mssql');
  });

  it('detects MSSQL by NVARCHAR', () => {
    expect(detectDialect('CREATE TABLE users (name NVARCHAR(100));')).toBe('mssql');
  });

  it('detects MSSQL by [dbo]', () => {
    expect(detectDialect('CREATE TABLE [dbo].[users] ([id] INT PRIMARY KEY);')).toBe('mssql');
  });

  it('detects Oracle by VARCHAR2', () => {
    expect(detectDialect('CREATE TABLE users (name VARCHAR2(100));')).toBe('oracle');
  });

  it('detects Oracle by NUMBER', () => {
    expect(detectDialect('CREATE TABLE users (id NUMBER(10) PRIMARY KEY);')).toBe('oracle');
  });

  it('detects SQLite by AUTOINCREMENT', () => {
    expect(detectDialect('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT);')).toBe('sqlite');
  });

  it('detects SQLite by INTEGER PRIMARY KEY', () => {
    expect(detectDialect('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);')).toBe('sqlite');
  });

  it('returns null for ambiguous DDL', () => {
    expect(detectDialect('CREATE TABLE users (id INT PRIMARY KEY);')).toBeNull();
  });

  it('returns null for short text', () => {
    expect(detectDialect('SELECT 1')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(detectDialect('create table users (id int auto_increment primary key);')).toBe('mysql');
  });
});
