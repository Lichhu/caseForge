const VAR_PATTERN = /\{\{?\s*([a-zA-Z_][\w.-]*)\s*\}?\}/g;

export function substituteVariables(
  input: string,
  vars: Record<string, string>,
) {
  return input.replace(VAR_PATTERN, (_, key: string) => {
    if (vars[key] !== undefined) return vars[key];
    return `{{${key}}}`;
  });
}

export function substituteDeep<T>(
  value: T,
  vars: Record<string, string>,
): T {
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
