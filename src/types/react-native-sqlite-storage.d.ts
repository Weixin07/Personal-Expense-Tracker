declare module 'react-native-sqlite-storage' {
  export function DEBUG(isDebug: boolean): void;
  export function enablePromise(enablePromise: boolean): void;

  export type Location = 'default' | 'Library' | 'Documents' | 'Shared';

  export interface DatabaseOptionalParams {
    createFromLocation?: number | string;
    key?: string;
    readOnly?: boolean;
  }

  export interface DatabaseParams extends DatabaseOptionalParams {
    name: string;
    location?: Location;
  }

  export function openDatabase(params: DatabaseParams): Promise<SQLiteDatabase>;
  export function deleteDatabase(params: DatabaseParams): Promise<void>;

  export interface SQLError {
    code: number;
    message: string;
  }

  export interface ResultSetRowList {
    length: number;
    raw(): unknown[];
    item(index: number): unknown;
  }

  // insertId is absent for non-INSERT statements (e.g. SELECT) and rowsAffected
  // can be absent on some drivers, so both are optional.
  export interface ResultSet {
    insertId?: number;
    rowsAffected?: number;
    rows: ResultSetRowList;
  }

  export type TransactionErrorCallback = (error: SQLError) => void;
  export type TransactionCallback = (transaction: Transaction) => void;

  export interface Transaction {
    executeSql(
      sqlStatement: string,
      args?: unknown[],
    ): Promise<[Transaction, ResultSet]>;
  }

  export interface SQLiteDatabase {
    dbname: string;
    transaction(
      scope: (tx: Transaction) => void,
      error?: TransactionErrorCallback,
      success?: TransactionCallback,
    ): void;
    close(): Promise<void>;
    executeSql(statement: string, params?: unknown[]): Promise<[ResultSet]>;
  }

  const SQLite: {
    DEBUG: typeof DEBUG;
    enablePromise: typeof enablePromise;
    openDatabase: typeof openDatabase;
    deleteDatabase: typeof deleteDatabase;
  };
  export default SQLite;
}
