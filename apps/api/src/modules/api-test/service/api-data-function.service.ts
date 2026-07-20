import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createPool } from "mysql2/promise";
import { randomInt, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { DOMParser } from "@xmldom/xmldom";
import { Repository } from "typeorm";
import {
  auditFieldsForCreate,
  auditFieldsForUpdate,
} from "@common/audit/request-context";
import { ApiDatabaseConnectionEntity } from "@api-test/entity/api-database-connection.entity";
import { ApiDataFunctionEntity } from "@api-test/entity/api-data-function.entity";
import {
  PreviewDataFunctionDto,
  SaveDataFunctionDto,
  SaveDatabaseConnectionDto,
} from "@api-test/dto/save-data-function.dto";
import {
  decryptSecrets,
  encryptSecrets,
} from "@api-test/util/secret-crypto.util";

type FormulaPart = {
  id?: string;
  operator?: string;
  kind: string;
  value?: string;
  length?: number;
};

const BUILTIN_FUNCTIONS = [
  { name: "DATE_YYYYMMDD", parts: [{ id: "builtin-date", operator: "concat", kind: "time", value: "yyyyMMdd", length: 4 }], description: "当前日期 yyyyMMdd" },
  { name: "DATETIME_YYYYMMDDHHMMSS", parts: [{ id: "builtin-datetime", operator: "concat", kind: "time", value: "yyyyMMddHHmmss", length: 4 }], description: "当前日期时间 yyyyMMddHHmmss" },
  { name: "TIMESTAMP_MS", parts: [{ id: "builtin-timestamp", operator: "concat", kind: "time", value: "ms", length: 4 }], description: "当前毫秒时间戳" },
  { name: "UUID", parts: [{ id: "builtin-uuid", operator: "concat", kind: "uuid", value: "", length: 4 }], description: "UUID v4" },
  { name: "RANDOM_4", parts: [{ id: "builtin-random", operator: "concat", kind: "random", value: "", length: 4 }], description: "四位随机数字" },
] as const;

@Injectable()
export class ApiDataFunctionService {
  constructor(
    @InjectRepository(ApiDatabaseConnectionEntity)
    private readonly connectionRepo: Repository<ApiDatabaseConnectionEntity>,
    @InjectRepository(ApiDataFunctionEntity)
    private readonly functionRepo: Repository<ApiDataFunctionEntity>,
  ) {}

  listConnections(projectId: string) {
    return this.connectionRepo
      .find({ where: { projectId }, order: { updatedAt: "DESC" } })
      .then((rows) => rows.map((row) => this.publicConnection(row)));
  }
  async saveConnection(
    projectId: string,
    body: SaveDatabaseConnectionDto,
    id?: string,
  ) {
    const row = id
      ? await this.requireConnection(projectId, id)
      : this.connectionRepo.create({ projectId, ...auditFieldsForCreate() });
    Object.assign(row, {
      name: body.name.trim(),
      type: body.type,
      host: body.host.trim(),
      port: body.port,
      databaseName: body.databaseName.trim(),
      username: body.username.trim(),
      readonly: body.readonly ?? true,
      ...(id ? auditFieldsForUpdate() : {}),
    });
    if (body.password)
      row.passwordEncrypted = encryptSecrets({ password: body.password });
    return this.publicConnection(await this.connectionRepo.save(row));
  }
  async deleteConnection(projectId: string, id: string) {
    await this.requireConnection(projectId, id);
    await this.connectionRepo.delete({ projectId, id });
    return { ok: true };
  }
  async testConnection(projectId: string, id: string) {
    const pool = await this.pool(await this.requireConnection(projectId, id));
    try {
      await pool.query("SELECT 1");
      return { ok: true };
    } finally {
      await pool.end();
    }
  }
  async metadata(projectId: string, id: string) {
    const row = await this.requireConnection(projectId, id);
    const pool = await this.pool(row);
    try {
      const [tables] = await pool.query<any[]>(
        "SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
        [row.databaseName],
      );
      const [columns] = await pool.query<any[]>(
        "SELECT TABLE_NAME tableName, COLUMN_NAME name, COLUMN_TYPE type, IS_NULLABLE nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION",
        [row.databaseName],
      );
      const grouped = columns.reduce<Record<string, any[]>>((result, item) => {
        (result[item.tableName] ??= []).push(item);
        return result;
      }, {});
      return { tables: tables.map((item) => item.name), columns: grouped };
    } finally {
      await pool.end();
    }
  }

  async listFunctions(projectId: string) {
    const rows = await this.functionRepo.find({
      where: { projectId },
      order: { updatedAt: "DESC" },
    });
    const names = new Set(rows.map((row) => row.name));
    const missing = BUILTIN_FUNCTIONS.filter((item) => !names.has(item.name)).map((item) =>
      this.functionRepo.create({
        projectId,
        name: item.name,
        params: [],
        type: "template",
        config: { builtin: true, mode: "builder", parts: item.parts },
        description: item.description,
        ...auditFieldsForCreate(),
      }),
    );
    return missing.length ? [...rows, ...(await this.functionRepo.save(missing))] : rows;
  }
  async saveFunction(
    projectId: string,
    body: SaveDataFunctionDto,
    id?: string,
  ) {
    const row = id
      ? await this.requireFunction(projectId, id)
      : this.functionRepo.create({ projectId, ...auditFieldsForCreate() });
    if (id && row.config.builtin) throw new BadRequestException("内置函数不可修改");
    Object.assign(row, {
      name: body.name.trim().toUpperCase(),
      params: body.params,
      type: body.type,
      config: body.config,
      description: body.description ?? "",
      ...(id ? auditFieldsForUpdate() : {}),
    });
    return this.functionRepo.save(row);
  }
  async deleteFunction(projectId: string, id: string) {
    const row = await this.requireFunction(projectId, id);
    if (row.config.builtin) throw new BadRequestException("内置函数不可删除");
    await this.functionRepo.delete({ projectId, id });
    return { ok: true };
  }
  preview(projectId: string, body: PreviewDataFunctionDto) {
    return this.evaluate(projectId, body, body.values);
  }

  async resolveDeep(projectId: string, value: unknown): Promise<unknown> {
    const functions = await this.functionRepo.find({ where: { projectId } });
    const walk = async (item: unknown): Promise<unknown> => {
      if (typeof item === "string")
        return this.resolveText(projectId, item, functions, value);
      if (Array.isArray(item)) return Promise.all(item.map(walk));
      if (item && typeof item === "object")
        return Object.fromEntries(
          await Promise.all(
            Object.entries(item).map(async ([key, child]) => [
              key,
              await walk(child),
            ]),
          ),
        );
      return item;
    };
    return walk(value);
  }

  private async resolveText(
    projectId: string,
    text: string,
    functions: ApiDataFunctionEntity[],
    request: unknown,
  ) {
    const pattern =
      /\$\{([A-Z][A-Z0-9_]*)\(([^{}]*)\)(?:\.([A-Za-z_][\w]*))?\}/g;
    let result = text;
    for (let depth = 0; depth < 5 && pattern.test(result); depth += 1) {
      pattern.lastIndex = 0;
      const matches = [...result.matchAll(pattern)];
      for (const match of matches) {
        const fn = functions.find((item) => item.name === match[1]);
        if (!fn) throw new BadRequestException(`数据函数 ${match[1]} 不存在`);
        const args = this.parseArgs(match[2]).map((arg) =>
          arg.startsWith("$.") ? this.requestValue(request, arg) : arg,
        );
        const values = Object.fromEntries(
          fn.params.map((name, index) => [name, args[index] ?? ""]),
        );
        const evaluated = await this.evaluate(projectId, fn, values);
        const resolved = match[3]
          ? (evaluated as Record<string, unknown> | null)?.[match[3]]
          : evaluated;
        result = result.replace(match[0], String(resolved ?? ""));
      }
    }
    if (pattern.test(result))
      throw new BadRequestException("数据函数嵌套超过 5 层");
    return result;
  }

  private async evaluate(
    projectId: string,
    fn: Pick<ApiDataFunctionEntity, "type" | "config" | "params">,
    values: Record<string, unknown>,
  ) {
    for (const name of fn.params)
      if (values[name] === undefined)
        throw new BadRequestException(`缺少函数参数 ${name}`);
    if (fn.type === "sql")
      return this.queryFunction(projectId, fn.config, values);
    if (fn.config.mode === "javascript" || fn.config.mode === "python")
      return this.runScript(
        String(fn.config.mode),
        String(fn.config.script ?? ""),
        fn.params.map((name) => values[name]),
      );
    const parts = (fn.config.parts ?? []) as FormulaPart[];
    let result: string | number = String(this.partValue(parts[0], values));
    for (const part of parts.slice(1)) {
      const next = this.partValue(part, values);
      const op = part.operator ?? "concat";
      if (op === "concat") result = `${result}${next}`;
      else {
        const left: number = Number(result);
        const right: number = Number(next);
        if (!Number.isFinite(left) || !Number.isFinite(right))
          throw new BadRequestException("算术运算只支持数字");
        if (op === "add") result = left + right;
        else if (op === "subtract") result = left - right;
        else if (op === "multiply") result = left * right;
        else {
          if (right === 0) throw new BadRequestException("除数不能为 0");
          result = left / right;
        }
      }
    }
    return result ?? "";
  }
  private partValue(
    part: FormulaPart | undefined,
    values: Record<string, unknown>,
  ) {
    if (!part) return "";
    if (part.kind === "param") return values[part.value ?? ""] ?? "";
    if (part.kind === "time") return formatDate(part.value);
    if (part.kind === "random")
      return Array.from(
        { length: Math.min(32, Math.max(1, part.length ?? 4)) },
        () => randomInt(10),
      ).join("");
    if (part.kind === "uuid") return randomUUID();
    return part.value ?? "";
  }
  private runScript(language: string, source: string, args: unknown[]) {
    const javascript = /^\s*function\s*\([^)]*\)\s*\{[\s\S]*\}\s*$/.test(
      source,
    );
    const python = /^\s*def\s+function\s*\([^)]*\)\s*:[\s\S]+$/.test(source);
    if (
      (language === "javascript" && !javascript) ||
      (language === "python" && !python)
    )
      throw new BadRequestException(
        language === "javascript"
          ? "JavaScript 必须使用 function(参数) { ... }"
          : "Python 必须使用 def function(参数):",
      );
    if (language === "python" && /^\s*(?:from\s+\S+\s+import|import\s+)/m.test(source))
      throw new BadRequestException("Python 脚本不允许 import；可直接使用 datetime 和 random");
    const runner =
      language === "javascript"
        ? `[s,a]=JSON.parse(process.argv[1]);const f=eval('('+s+')');Promise.resolve(f(...a)).then(v=>process.stdout.write(JSON.stringify(v)))`
      : `import json,sys,random,importlib,types\nfrom datetime import datetime as dt\ndef limited_import(name,*_):\n    if name in {"_strptime","time","locale","re","calendar"}: return importlib.import_module(name)\n    raise ImportError("import is not allowed")\ns,a=json.loads(sys.argv[1])\nb={}\ndatetime=types.SimpleNamespace(datetime=dt,now=dt.now)\nexec(s,{"__builtins__":{"str":str,"int":int,"float":float,"bool":bool,"len":len,"range":range,"min":min,"max":max,"sum":sum,"__import__":limited_import},"datetime":datetime,"random":random},b)\nprint(json.dumps(b["function"](*a),ensure_ascii=False))`;
    const command = language === "javascript" ? process.execPath : "python3";
    const commandArgs = language === "javascript"
      ? ["--permission", "-e", runner, JSON.stringify([source, args])]
      : ["-I", "-S", "-c", runner, JSON.stringify([source, args])];
    return new Promise((resolve, reject) => {
      const child = spawn(command, commandArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { PATH: process.env.PATH ?? "", LANG: process.env.LANG ?? "C.UTF-8" },
      });
      let output = "";
      let error = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new BadRequestException("脚本执行超过 2 秒"));
      }, 2000);
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.length > 1_000_000) child.kill("SIGKILL");
      });
      child.stderr.on("data", (chunk) => {
        error += chunk;
      });
      child.on("error", () => {
        clearTimeout(timer);
        reject(new BadRequestException("当前环境不支持安全脚本执行"));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code)
          return reject(
            new BadRequestException(error.trim() || "脚本执行失败"),
          );
        try {
          resolve(JSON.parse(output || "null"));
        } catch {
          reject(new BadRequestException("脚本返回值必须可序列化为 JSON"));
        }
      });
    });
  }
  private async queryFunction(
    projectId: string,
    config: Record<string, unknown>,
    values: Record<string, unknown>,
  ) {
    const connection = await this.requireConnection(
      projectId,
      String(config.connectionId ?? ""),
    );
    let sql = String(config.sql ?? "").trim();
    if (
      !/^select\s/i.test(sql) ||
      /;\s*\S/.test(sql) ||
      /\b(insert|update|delete|drop|alter|create|truncate|grant|call)\b/i.test(
        sql,
      )
    )
      throw new BadRequestException("数据函数仅允许单条 SELECT 查询");
    const bindings = {
      ...((config.fixedValues ?? {}) as Record<string, unknown>),
      ...values,
    };
    const params: unknown[] = [];
    sql = sql.replace(/:([A-Za-z_][\w]*)/g, (_, name) => {
      if (!(name in bindings))
        throw new BadRequestException(`SQL 缺少参数 ${name}`);
      params.push(bindings[name]);
      return "?";
    });
    if (!/\blimit\s+\d+/i.test(sql)) sql += " LIMIT 20";
    const pool = await this.pool(connection);
    try {
      const [rows] = await pool.query<any[]>({ sql, timeout: 10000 }, params);
      const first = rows[0];
      const field = String(config.returnField ?? "");
      return field ? (first?.[field] ?? "") : (first ?? "");
    } finally {
      await pool.end();
    }
  }
  private parseArgs(source: string) {
    if (!source.trim()) return [];
    return source
      .split(",")
      .map((item) => item.trim().replace(/^(['"])(.*)\1$/, "$2"));
  }
  private requestValue(request: unknown, path: string): unknown {
    const parts = path.slice(2).split(".").filter(Boolean);
    const body = request && typeof request === "object" && "body" in request
      ? (request as { body: unknown }).body
      : request;
    let value: unknown = body;
    if (typeof body === "string") {
      const source = body.trim();
      if (source.startsWith("{") || source.startsWith("[")) {
        try { value = JSON.parse(source); } catch { throw new BadRequestException("函数参数引用的请求体不是有效 JSON"); }
      } else if (source.startsWith("<")) {
        const doc = new DOMParser().parseFromString(source, "text/xml");
        let node: any = doc.documentElement;
        for (const part of parts[0] === node.nodeName ? parts.slice(1) : parts)
          node = Array.from(node?.childNodes ?? []).find((child: any) => child.nodeType === 1 && child.nodeName === part);
        if (!node) throw new BadRequestException(`请求体路径 ${path} 不存在`);
        return node.textContent;
      }
    }
    for (const part of parts)
      value = value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined;
    if (value === undefined) throw new BadRequestException(`请求体路径 ${path} 不存在`);
    return value;
  }
  private async pool(row: ApiDatabaseConnectionEntity) {
    if (!["MySQL", "TiDB", "OceanBase"].includes(row.type))
      throw new BadRequestException(`${row.type} 驱动尚未配置`);
    const password = decryptSecrets(row.passwordEncrypted).password ?? "";
    return createPool({
      host: row.host,
      port: row.port,
      database: row.databaseName,
      user: row.username,
      password,
      connectionLimit: 1,
      connectTimeout: 5000,
    });
  }
  private publicConnection(row: ApiDatabaseConnectionEntity) {
    const { passwordEncrypted, ...publicRow } = row;
    return { ...publicRow, hasPassword: Boolean(passwordEncrypted) };
  }
  private async requireConnection(projectId: string, id: string) {
    const row = await this.connectionRepo.findOne({ where: { projectId, id } });
    if (!row) throw new NotFoundException("数据库连接不存在");
    return row;
  }
  private async requireFunction(projectId: string, id: string) {
    const row = await this.functionRepo.findOne({ where: { projectId, id } });
    if (!row) throw new NotFoundException("数据函数不存在");
    return row;
  }
}

function formatDate(format = "yyyyMMddHHmmss") {
  const date = new Date();
  if (format === "ms") return String(date.getTime());
  const values: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    dd: String(date.getDate()).padStart(2, "0"),
    HH: String(date.getHours()).padStart(2, "0"),
    mm: String(date.getMinutes()).padStart(2, "0"),
    ss: String(date.getSeconds()).padStart(2, "0"),
  };
  return format.replace(/yyyy|MM|dd|HH|mm|ss/g, (key) => values[key]);
}
