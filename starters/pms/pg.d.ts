declare module "pg" {
  export class Client {
    constructor(config?: { connectionString?: string })
    connect(): Promise<void>
    end(): Promise<void>
    query<T = unknown>(
      queryText: string,
      values?: ReadonlyArray<unknown>,
    ): Promise<{ rowCount: number; rows: T[] }>
  }
  export class Pool {
    constructor(config?: { connectionString?: string; max?: number })
    end(): Promise<void>
  }
}
