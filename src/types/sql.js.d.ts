declare module "sql.js" {
  interface Database {
    run(sql: string, params?: unknown[]): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  interface Statement {
    bind(params?: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export type { Database, Statement, SqlJsStatic };
  export default function initSqlJs(): Promise<SqlJsStatic>;
}
