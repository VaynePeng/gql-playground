import type { Catalog, FieldInfo, PracticeData, TypeInfo } from "../types";
import { findType } from "./catalog";

/** Stored document columns. Names are exact keys — never aliases. */
const ENTITIES = ["Customer", "Product", "Order", "OrderItem"] as const;
const ENTITIES_BY_LENGTH = [...ENTITIES].sort((a, b) => b.length - a.length);

interface ColumnSpec {
  name: string;
  width: string;
  /** Shown in the narrow grid. Other fields stay in the name list and the opened row. */
  preview: boolean;
}

interface TableSpec {
  key: keyof Pick<PracticeData, "customers" | "products" | "orders" | "orderItems">;
  title: string;
  typeName: (typeof ENTITIES)[number];
  columns: ColumnSpec[];
}

const TABLES: TableSpec[] = [
  {
    key: "customers",
    title: "客户",
    typeName: "Customer",
    columns: [
      { name: "id", width: "2.4rem", preview: true },
      { name: "name", width: "minmax(0, 1.5fr)", preview: true },
      { name: "city", width: "3.2rem", preview: true },
      { name: "email", width: "minmax(8rem, 1.4fr)", preview: false },
      { name: "createdAt", width: "12rem", preview: false },
    ],
  },
  {
    key: "products",
    title: "商品",
    typeName: "Product",
    columns: [
      { name: "id", width: "2.4rem", preview: true },
      { name: "name", width: "minmax(0, 1.4fr)", preview: true },
      { name: "category", width: "3rem", preview: false },
      { name: "price", width: "3.2rem", preview: true },
      { name: "attributes", width: "minmax(8rem, 1.5fr)", preview: false },
    ],
  },
  {
    key: "orders",
    title: "订单",
    typeName: "Order",
    columns: [
      { name: "id", width: "2.4rem", preview: true },
      { name: "customerId", width: "5.2rem", preview: false },
      { name: "status", width: "minmax(4.6rem, 0.9fr)", preview: true },
      { name: "total", width: "3.4rem", preview: true },
      { name: "createdAt", width: "12rem", preview: false },
      { name: "note", width: "minmax(4rem, 1fr)", preview: false },
    ],
  },
  {
    key: "orderItems",
    title: "订单明细",
    typeName: "OrderItem",
    columns: [
      { name: "id", width: "2.4rem", preview: true },
      { name: "orderId", width: "minmax(3.4rem, 1fr)", preview: true },
      { name: "productId", width: "minmax(4rem, 1fr)", preview: true },
      { name: "quantity", width: "2.6rem", preview: false },
      { name: "unitPrice", width: "4.4rem", preview: false },
    ],
  },
];

export interface TableColumn {
  name: string;
  width: string;
  preview: boolean;
  /** Set only when the GraphQL type has a field with this exact name. */
  graphqlType: string | null;
}

export interface TableAction {
  label: string;
  kind: "query" | "mutation";
  typeName: string;
  fieldName: string;
  description: string | null;
  signature: string;
}

export interface DatabaseTable {
  key: TableSpec["key"];
  title: string;
  collection: string;
  typeName: string;
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  total: number;
  actions: TableAction[];
}

export interface DatabaseView {
  tables: DatabaseTable[];
  other: TableAction[];
}

export function unwrapTypeName(type: string) {
  return type.replace(/[![\]]/g, "");
}

export function inputEntity(inputName: string) {
  if ((ENTITIES as readonly string[]).includes(inputName)) return inputName;
  for (const entity of ENTITIES_BY_LENGTH) {
    if (inputName.endsWith(`${entity}Input`)) return entity;
  }
  return null;
}

export function readCell(row: Record<string, unknown>, column: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(row, column)) return undefined;
  return row[column];
}

export function cellState(
  row: Record<string, unknown>,
  column: string,
): { missing: true } | { missing: false; value: unknown } {
  if (!Object.prototype.hasOwnProperty.call(row, column)) return { missing: true };
  return { missing: false, value: row[column] };
}

export function formatCell(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

export function rowKey(row: Record<string, unknown>, index: number) {
  if (Object.prototype.hasOwnProperty.call(row, "id") && row.id !== undefined)
    return `id:${String(row.id)}`;
  return `index:${index}`;
}

function copyRow(row: object): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    const value = (row as Record<string, unknown>)[key];
    if (value !== null && typeof value === "object") {
      copy[key] = JSON.parse(JSON.stringify(value)) as unknown;
      continue;
    }
    copy[key] = value;
  }
  return copy;
}

function signatureOf(owner: TypeInfo, field: FieldInfo) {
  const args = field.args.map((arg) => `${arg.name}: ${arg.type}`).join(", ");
  const head = args ? `${field.name}(${args})` : field.name;
  const prefix =
    owner.kind === "query" || owner.kind === "mutation" ? "" : `${owner.name}.`;
  return `${prefix}${head}: ${field.type}`;
}

function actionFrom(owner: TypeInfo, field: FieldInfo): TableAction {
  const root = owner.kind === "query" || owner.kind === "mutation";
  return {
    label: root ? field.name : `${owner.name}.${field.name}`,
    kind: owner.kind === "mutation" ? "mutation" : "query",
    typeName: owner.name,
    fieldName: field.name,
    description: field.description,
    signature: signatureOf(owner, field),
  };
}

function inputTouches(
  typeName: string,
  entity: string,
  catalog: Catalog,
  seen = new Set<string>(),
): boolean {
  const named = unwrapTypeName(typeName);
  if (!named || seen.has(named)) return false;
  seen.add(named);
  if (inputEntity(named) === entity) return true;
  const input = catalog.types.find(
    (type) => type.name === named && type.kind === "input",
  );
  if (!input) return false;
  return input.fields.some((field) =>
    inputTouches(field.namedType, entity, catalog, seen),
  );
}

function actionsFor(entity: string, catalog: Catalog): TableAction[] {
  const actions: TableAction[] = [];
  const seen = new Set<string>();
  const push = (owner: TypeInfo, field: FieldInfo) => {
    const key = `${owner.name}.${field.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    actions.push(actionFrom(owner, field));
  };
  for (const field of catalog.query.fields) {
    if (field.namedType === entity) push(catalog.query, field);
  }
  for (const type of catalog.types) {
    if (type.kind !== "object") continue;
    for (const field of type.fields) {
      if (field.namedType === entity) push(type, field);
    }
  }
  if (catalog.mutation) {
    for (const field of catalog.mutation.fields) {
      if (field.namedType === entity) push(catalog.mutation, field);
    }
    for (const field of catalog.mutation.fields) {
      const writes = field.args.some((arg) =>
        inputTouches(unwrapTypeName(arg.type), entity, catalog),
      );
      if (writes) push(catalog.mutation, field);
    }
  }
  return actions;
}

function columnsFor(
  spec: TableSpec,
  rows: Record<string, unknown>[],
  catalog: Catalog,
): TableColumn[] {
  const gql = findType(catalog, spec.typeName);
  const declared = new Set(spec.columns.map((column) => column.name));
  const extras: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!declared.has(key) && !extras.includes(key)) extras.push(key);
    }
  }
  const specs: ColumnSpec[] = [
    ...spec.columns,
    ...extras.map((name) => ({ name, width: "minmax(5rem, 1fr)", preview: false })),
  ];
  return specs.map((column) => {
    const field = gql?.fields.find((item) => item.name === column.name);
    return {
      name: column.name,
      width: column.width,
      preview: column.preview,
      graphqlType: field ? field.type : null,
    };
  });
}

export function describeDatabase(data: PracticeData, catalog: Catalog): DatabaseView {
  const tables = TABLES.map((spec) => {
    const rows = data[spec.key].map((row) => copyRow(row));
    return {
      key: spec.key,
      title: spec.title,
      collection: spec.key,
      typeName: spec.typeName,
      columns: columnsFor(spec, rows, catalog),
      rows,
      total: rows.length,
      actions: actionsFor(spec.typeName, catalog),
    };
  });
  const used = new Set(
    tables.flatMap((table) =>
      table.actions
        .filter((action) => action.typeName === "Query" || action.typeName === "Mutation")
        .map((action) => `${action.typeName}.${action.fieldName}`),
    ),
  );
  const other: TableAction[] = [];
  for (const field of catalog.query.fields) {
    if (!used.has(`Query.${field.name}`)) other.push(actionFrom(catalog.query, field));
  }
  if (catalog.mutation) {
    for (const field of catalog.mutation.fields) {
      if (!used.has(`Mutation.${field.name}`))
        other.push(actionFrom(catalog.mutation, field));
    }
  }
  return { tables, other };
}

function rowMatches(row: Record<string, unknown>, columns: TableColumn[], term: string) {
  return columns.some((column) => {
    if (!Object.prototype.hasOwnProperty.call(row, column.name)) return false;
    return formatCell(row[column.name]).toLowerCase().includes(term);
  });
}

export const PREVIEW_PAGE_SIZE = 50;

export function pageRows<T>(rows: T[], page: number, size = PREVIEW_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  const start = current * size;
  return {
    page: current,
    pages,
    rows: rows.slice(start, start + size),
    total: rows.length,
    from: rows.length ? start + 1 : 0,
    to: Math.min(rows.length, start + size),
  };
}

export function filterDatabaseView(view: DatabaseView, term: string): DatabaseView {
  const query = term.trim().toLowerCase();
  if (!query) return view;
  const tables: DatabaseTable[] = [];
  for (const table of view.tables) {
    const meta = [
      table.title,
      table.collection,
      table.typeName,
      ...table.columns.map((column) => column.name),
    ]
      .join("\n")
      .toLowerCase();
    const metaHit = meta.includes(query);
    const actionHit = table.actions.some(
      (action) =>
        action.label.toLowerCase().includes(query) ||
        action.fieldName.toLowerCase().includes(query),
    );
    const rowHits = table.rows.filter((row) => rowMatches(row, table.columns, query));
    if (!metaHit && !actionHit && !rowHits.length) continue;
    const rows = !metaHit && rowHits.length ? rowHits : table.rows;
    tables.push({ ...table, rows, total: table.total });
  }
  const other = view.other.filter(
    (action) =>
      action.label.toLowerCase().includes(query) ||
      action.fieldName.toLowerCase().includes(query) ||
      (action.description?.toLowerCase().includes(query) ?? false),
  );
  return { tables, other };
}
