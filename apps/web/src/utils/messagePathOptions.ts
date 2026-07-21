export function messagePathOptions(text: string) {
  const paths = new Set<string>();
  try {
    const walk = (value: unknown, path: string) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(
        value as Record<string, unknown>,
      )) {
        const next = `${path}.${key}`;
        paths.add(next);
        walk(child, next);
      }
    };
    walk(JSON.parse(text), "$");
  } catch {
    const root = new DOMParser().parseFromString(
      text,
      "application/xml",
    ).documentElement;
    const walk = (element: Element, parent = "$") => {
      const path = `${parent}.${element.tagName}`;
      paths.add(path);
      for (const child of element.children) walk(child, path);
    };
    if (root?.tagName !== "parsererror") {
      walk(root);
    }
  }
  return [...paths].sort().map((value) => ({ value, label: value }));
}
