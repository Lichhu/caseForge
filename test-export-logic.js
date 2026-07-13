/**
 * 临时验证脚本：测试 apiCaseExcelExport.util 中的字段提取逻辑
 * 不依赖 TypeScript/路径别名，纯 Node 可运行。
 */

// 在 Node 中模拟浏览器 DOMParser（简单递归解析，足够测试用）
if (typeof globalThis.DOMParser === "undefined") {
  globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };

  function parseXmlToNodes(str) {
    const tokens = str.match(/<\?xml[^?]*\?>|<[^>]+>|[^<]+/g) || [];
    let i = 0;

    function parseNode() {
      while (i < tokens.length) {
        const token = tokens[i].trim();
        if (!token || token.startsWith("<?xml")) {
          i++;
          continue;
        }
        if (token.startsWith("</")) {
          i++;
          return null;
        }
        if (token.startsWith("<")) {
          const match = token.match(/^<([a-zA-Z_:][\w:.-]*)([^>]*)\/?>/);
          if (!match) {
            i++;
            continue;
          }
          const [, tagName, attrs] = match;
          const selfClosing = token.endsWith("/>");
          i++;
          const children = [];
          if (!selfClosing) {
            while (i < tokens.length) {
              const peek = tokens[i];
              if (peek.trim().startsWith(`</${tagName}>`)) {
                i++;
                break;
              }
              const child = parseNode();
              if (child) children.push(child);
            }
          }
          const textContent = children
            .filter((n) => n.nodeType === globalThis.Node.TEXT_NODE)
            .map((n) => n.textContent)
            .join("")
            .trim();
          const localName = tagName.includes(":") ? tagName.split(":").pop() : tagName;
          return {
            nodeType: globalThis.Node.ELEMENT_NODE,
            tagName,
            localName,
            childNodes: children,
            textContent,
          };
        }
        // text node
        const text = tokens[i].trim();
        i++;
        if (text) {
          return {
            nodeType: globalThis.Node.TEXT_NODE,
            textContent: text,
          };
        }
      }
      return null;
    }

    const nodes = [];
    while (i < tokens.length) {
      const node = parseNode();
      if (node) nodes.push(node);
      else i++;
    }
    return nodes;
  }

  globalThis.DOMParser = class DOMParser {
    parseFromString(str) {
      const nodes = parseXmlToNodes(str);
      const root = nodes.find((n) => n.nodeType === globalThis.Node.ELEMENT_NODE) || {
        nodeType: globalThis.Node.ELEMENT_NODE,
        tagName: "root",
        localName: "root",
        childNodes: [],
        textContent: str,
      };
      return {
        documentElement: root,
        querySelector: (sel) =>
          sel === "parsererror" ? null : undefined,
      };
    }
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function flattenObject(value, prefix = "") {
  const result = {};
  if (value === null || value === undefined) return result;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const arrayPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`;
      Object.assign(result, flattenObject(item, arrayPrefix));
    });
    return result;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      Object.assign(result, flattenObject(child, path));
    }
    return result;
  }
  if (prefix) {
    result[prefix] = String(value);
  }
  return result;
}

function stripNamespace(key) {
  const colonIndex = key.indexOf(":");
  return colonIndex >= 0 ? key.slice(colonIndex + 1) : key;
}

function findKeyCaseInsensitive(value, target) {
  const targetLower = target.toLowerCase();
  return Object.keys(value).find((k) => {
    const localName = stripNamespace(k);
    return localName.toLowerCase() === targetLower;
  });
}

function findBizBody(value) {
  if (!isPlainObject(value)) return undefined;
  const matchedKey = findKeyCaseInsensitive(value, "bizBody");
  if (matchedKey) {
    return value[matchedKey];
  }
  for (const child of Object.values(value)) {
    const found = findBizBody(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

function looksLikeXml(value) {
  const trimmed = value.trim();
  return /^<\?xml\s/.test(trimmed) || /^<[a-zA-Z_][\w.-]*(?:\s+[^>]*)?>/.test(trimmed);
}

function parseXmlString(xmlString) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");
    const errorNode = doc.querySelector("parsererror");
    if (errorNode) {
      return xmlString;
    }
    const root = doc.documentElement;
    if (!root) {
      return xmlString;
    }

    function nodeToObject(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return undefined;
      }
      const element = node;
      const childElements = Array.from(element.childNodes).filter(
        (n) => n.nodeType === Node.ELEMENT_NODE,
      );
      if (childElements.length === 0) {
        return (element.textContent?.trim()) ?? "";
      }
      const obj = {};
      for (const child of childElements) {
        const key = child.localName || child.tagName || "item";
        const childObj = nodeToObject(child);
        if (key in obj) {
          const existing = obj[key];
          if (Array.isArray(existing)) {
            existing.push(childObj);
          } else {
            obj[key] = [existing, childObj];
          }
        } else {
          obj[key] = childObj;
        }
      }
      return obj;
    }

    return { [root.localName || root.tagName || "root"]: nodeToObject(root) };
  } catch {
    return xmlString;
  }
}

function parseBody(body) {
  if (body === null || body === undefined) {
    return undefined;
  }
  if (typeof body === "string") {
    if (looksLikeXml(body)) {
      return parseXmlString(body);
    }
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

function extractBodyFields(body) {
  const parsed = parseBody(body);
  if (parsed === undefined) {
    return {};
  }
  const bizBody = findBizBody(parsed);
  if (bizBody !== undefined) {
    if (isPlainObject(bizBody) || Array.isArray(bizBody)) {
      return flattenObject(bizBody);
    }
    if (bizBody === null) {
      return {};
    }
    return { bizBody: String(bizBody) };
  }
  if (typeof parsed === "string") {
    return parsed.trim() ? { body: parsed } : {};
  }
  return flattenObject(parsed);
}

function resolveFieldDisplayNames(paths) {
  const leafCounts = new Map();
  for (const path of paths) {
    const leaf = path.split(".").pop() || path;
    leafCounts.set(leaf, (leafCounts.get(leaf) ?? 0) + 1);
  }
  return paths.map((path) => {
    const leaf = path.split(".").pop() || path;
    if ((leafCounts.get(leaf) ?? 0) === 1) {
      return leaf;
    }
    return path;
  });
}

function buildCaseExportData(cases) {
  const EXPORT_BASE_HEADERS = ["属性", "案例名称", "启用状态"];
  const REMARK_HEADER = "备注";
  if (!cases.length) {
    return { headers: [...EXPORT_BASE_HEADERS, REMARK_HEADER], rows: [] };
  }

  const caseFieldMaps = cases.map((c) => extractBodyFields(c.request.body));
  const allPathsSet = new Set();
  for (const fields of caseFieldMaps) {
    for (const path of Object.keys(fields)) {
      allPathsSet.add(path);
    }
  }
  const allPaths = Array.from(allPathsSet);
  const displayNames = resolveFieldDisplayNames(allPaths);
  const pathToHeader = new Map();
  allPaths.forEach((path, index) => {
    pathToHeader.set(path, displayNames[index]);
  });

  const dynamicHeaders = displayNames;
  const headers = [...EXPORT_BASE_HEADERS, ...dynamicHeaders, REMARK_HEADER];

  const rows = cases.map((c, index) => {
    const fields = caseFieldMaps[index];
    const polarityLabel = c.polarity === "negative" ? "反案例" : "正案例";
    const enabledLabel = c.enabled ? "是" : "否";
    const base = [polarityLabel, c.title || c.caseNo || "", enabledLabel];
    const dynamicValues = dynamicHeaders.map((header) => {
      const path = allPaths.find((p) => pathToHeader.get(p) === header);
      if (!path) return "";
      return fields[path] ?? "";
    });
    return [...base, ...dynamicValues, c.remark ?? ""];
  });

  return { headers, rows };
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(
      `❌ ${message}\n   actual:   ${a}\n   expected: ${b}`,
    );
  }
  console.log(`✅ ${message}`);
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
  console.log(`✅ ${message}`);
}

function makeCase(overrides) {
  return {
    id: "id",
    projectId: "p",
    endpointId: "e",
    title: "案例名",
    description: "",
    priority: "P1",
    polarity: "positive",
    status: "ready",
    enabled: true,
    preconditions: [],
    request: { method: "POST", path: "/" },
    expected: {},
    remark: "",
    ...overrides,
  };
}

const JSON_BODY = {
  Transaction: {
    Header: { sysHeader: { msgId: "m1", msgDate: "20260713" } },
    Body: {
      request: {
        bizHeader: { pageNum: "1", pageSize: "20" },
        bizBody: { accName: "张三", accNo: "123456" },
      },
    },
  },
};

const XML_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<Transaction>
  <Header>
    <sysHeader>
      <msgId>m1</msgId>
      <msgDate>20260713</msgDate>
    </sysHeader>
  </Header>
  <Body>
    <request>
      <bizHeader>
        <pageNum>1</pageNum>
        <pageSize>20</pageSize>
      </bizHeader>
      <bizBody>
        <accName>张三</accName>
        <accNo>123456</accNo>
      </bizBody>
    </request>
  </Body>
</Transaction>`;

const NESTED_BIZ_BODY = {
  Transaction: {
    Body: {
      request: {
        bizBody: {
          user: { name: "A", age: "18" },
          items: [{ code: "i1" }, { code: "i2" }],
        },
      },
    },
  },
};

const NO_BIZBODY = {
  Transaction: {
    Header: { sysHeader: { msgId: "m1" } },
    Body: { request: { bizHeader: { pageNum: "1" }, accNo: "999" } },
  },
};

const FLAT_BODY = { msgId: "m1", pageNum: "1", accName: "A" };

console.log("\n=== 测试字段提取 ===\n");

// 1. JSON object body
let { headers, rows } = buildCaseExportData([
  makeCase({ request: { method: "POST", path: "/", body: JSON_BODY } }),
]);
assertEqual(headers, ["属性", "案例名称", "启用状态", "accName", "accNo", "备注"], "JSON object：只导出 bizBody 字段");
assertEqual(rows[0], ["正案例", "案例名", "是", "张三", "123456", ""], "JSON object：行数据正确");

// 2. JSON string body
({ headers, rows } = buildCaseExportData([
  makeCase({ request: { method: "POST", path: "/", body: JSON.stringify(JSON_BODY) } }),
]));
assertTrue(headers.includes("accName") && headers.includes("accNo"), "JSON string：包含 bizBody 字段");
assertTrue(!headers.includes("msgId") && !headers.includes("pageNum"), "JSON string：不包含 sysHeader/bizHeader 字段");

// 3. XML string body
({ headers, rows } = buildCaseExportData([
  makeCase({ request: { method: "POST", path: "/", body: XML_BODY } }),
]));
assertEqual(headers, ["属性", "案例名称", "启用状态", "accName", "accNo", "备注"], "XML string：只导出 bizBody 字段");
assertEqual(rows[0], ["正案例", "案例名", "是", "张三", "123456", ""], "XML string：行数据正确");

// 4. Nested objects / arrays inside bizBody
({ headers, rows } = buildCaseExportData([
  makeCase({ request: { method: "POST", path: "/", body: NESTED_BIZ_BODY } }),
]));
assertTrue(headers.includes("name"), "Nested bizBody：包含嵌套对象字段");
assertTrue(headers.includes("age"), "Nested bizBody：包含嵌套对象 age 字段");
assertTrue(headers.includes("items[0].code"), "Nested bizBody：包含数组元素字段");
assertTrue(headers.includes("items[1].code"), "Nested bizBody：包含数组元素字段");
assertTrue(!headers.includes("msgId"), "Nested bizBody：不包含外部字段");

// 5. Missing bizBody falls back to all fields
({ headers } = buildCaseExportData([
  makeCase({ request: { method: "POST", path: "/", body: NO_BIZBODY } }),
]));
assertTrue(headers.includes("msgId") && headers.includes("pageNum") && headers.includes("accNo"), "无 bizBody：回退导出全部字段");

// 6. Flat body without bizBody
({ headers } = buildCaseExportData([
  makeCase({ request: { method: "POST", path: "/", body: FLAT_BODY } }),
]));
assertTrue(headers.includes("msgId") && headers.includes("pageNum") && headers.includes("accName"), "扁平 body：导出全部字段");

// 7. Empty body
({ headers, rows } = buildCaseExportData([
  makeCase({ request: { method: "POST", path: "/" } }),
]));
assertEqual(headers, ["属性", "案例名称", "启用状态", "备注"], "空 body：只导出固定列");
assertEqual(rows[0], ["正案例", "案例名", "是", ""], "空 body：行数据正确");

// 8. Multiple cases union columns
({ headers, rows } = buildCaseExportData([
  makeCase({ id: "1", request: { method: "POST", path: "/", body: { bizBody: { accName: "A" } } } }),
  makeCase({ id: "2", request: { method: "POST", path: "/", body: { bizBody: { accNo: "B" } } } }),
]));
assertEqual(headers, ["属性", "案例名称", "启用状态", "accName", "accNo", "备注"], "多案例：列取并集");
assertEqual(rows[0], ["正案例", "案例名", "是", "A", "", ""], "多案例：第一行正确");
assertEqual(rows[1], ["正案例", "案例名", "是", "", "B", ""], "多案例：第二行正确");

// 9. Negative polarity
({ rows } = buildCaseExportData([
  makeCase({ polarity: "negative", request: { method: "POST", path: "/", body: { bizBody: { accNo: "999" } } } }),
]));
assertEqual(rows[0][0], "反案例", "反案例属性正确");

// 10. Case-insensitive bizBody (BizBody)
({ headers } = buildCaseExportData([
  makeCase({ request: { method: "POST", path: "/", body: { Transaction: { Body: { request: { BizBody: { foo: "1" } } } } } } }),
]));
assertTrue(headers.includes("foo"), "大小写不敏感：BizBody 也能识别");

// 11. Namespace in XML tag (ns:bizBody)
const XML_WITH_NS = `<?xml version="1.0"?>
<root>
  <ns:BizBody xmlns:ns="http://x">
    <ns:bar>2</ns:bar>
  </ns:BizBody>
</root>`;
({ headers } = buildCaseExportData([
  makeCase({ request: { method: "POST", path: "/", body: XML_WITH_NS } }),
]));
assertTrue(headers.includes("bar"), "XML 命名空间：ns:BizBody 也能识别");

console.log("\n🎉 全部测试通过\n");
