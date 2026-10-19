const VAR_PATTERN =
  /\$\{\s*([a-zA-Z_][\w.-]*)\s*\}|\{\{?\s*([a-zA-Z_][\w.-]*)\s*\}?\}/g;

export function substituteVariables(
  input: string,
  vars: Record<string, string>,
) {
  return input.replace(
    VAR_PATTERN,
    (_, dollarKey: string, braceKey: string) => {
      const key = dollarKey ?? braceKey;
      if (vars[key] !== undefined) return vars[key];
      return dollarKey ? `\${${key}}` : `{{${key}}}`;
    },
  );
}

/**
 * SQL 步骤的变量替换：SQL 里直接写 `${变量名}`（和数据函数同一套语法），
 * 不做驱动参数绑定，替换值按 SQL 字符串字面量规则把单引号转义成两个，
 * 避免变量里带引号时把语句写坏。
 */
export function substituteSqlVariables(
  input: string,
  vars: Record<string, string>,
) {
  return input.replace(
    VAR_PATTERN,
    (_, dollarKey: string, braceKey: string) => {
      const key = dollarKey ?? braceKey;
      if (vars[key] === undefined)
        return dollarKey ? `\${${key}}` : `{{${key}}}`;
      return String(vars[key]).replace(/'/g, "''");
    },
  );
}

export function substituteDeep<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === "string") {
    return substituteVariables(value, vars) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteDeep(item, vars)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = substituteDeep(v, vars);
    }
    return out as T;
  }
  return value;
}

export function buildRuntimeVariables(
  envVars: Record<string, string> | undefined,
  secrets: Record<string, string>,
) {
  return {
    ...(envVars ?? {}),
    ...secrets,
    token: secrets.token ?? secrets.TOKEN ?? envVars?.token ?? "",
  };
}
