declare module 'sql.js' {
	export interface SqlJsStatic {
		Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
	}

	export interface Statement {
		getColumnNames(): string[];
		step(): boolean;
		get(params?: any): any[];
		free(): void;
	}

	export interface Database {
		exec(sql: string): QueryExecResult[];
		run(sql: string, params?: any): Database;
		prepare(sql: string): Statement;
		getRowsModified(): number;
		close(): void;
	}

	export interface QueryExecResult {
		columns: string[];
		values: any[][];
	}

	export interface SqlJsConfig {
		locateFile?: (file: string) => string;
	}

	export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
