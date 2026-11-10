export interface GqlError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

export interface Execution {
  data: unknown;
  errors?: GqlError[];
  json: string;
  operation: string;
}

export type SchemaKind =
  | "query"
  | "mutation"
  | "object"
  | "enum"
  | "input"
  | "union"
  | "interface"
  | "scalar";

export interface ArgInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  description: string | null;
}

export interface FieldInfo {
  name: string;
  description: string | null;
  type: string;
  namedType: string;
  nullable: boolean;
  args: ArgInfo[];
  isLeaf: boolean;
}

export interface TypeInfo {
  name: string;
  kind: SchemaKind;
  description: string | null;
  fields: FieldInfo[];
  enumValues: { name: string; description: string | null }[];
  possibleTypes: string[];
}

export interface Catalog {
  query: TypeInfo;
  mutation: TypeInfo | null;
  types: TypeInfo[];
}

export type SchemaNode =
  | { kind: "type"; name: string }
  | { kind: "field"; typeName: string; fieldName: string };

export interface HistoryItem {
  id: string;
  query: string;
  call: string;
  scope: string;
  time: string;
  duration: number;
  success: boolean;
  summary: string;
  error?: GqlError;
}

export interface AppData {
  databaseId: string;
  retired: string[];
  draft: string;
  call: string;
  history: HistoryItem[];
  sidebar: number;
  editorHeight: number;
}

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELLED";

export interface CustomerRow {
  id: number;
  name: string;
  city: string | null;
  email: string | null;
  createdAt: string;
}

export interface ProductRow {
  id: number;
  name: string;
  category: string;
  price: number;
  attributes: Record<string, unknown>;
}

export interface OrderRow {
  id: number;
  customerId: number;
  status: OrderStatus;
  total: number;
  createdAt: string;
  note: string | null;
}

export interface OrderItemRow {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
}

export interface PracticeData {
  version: 1;
  example: boolean;
  customers: CustomerRow[];
  products: ProductRow[];
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  nextIds: { customer: number; product: number; order: number; item: number };
}

export interface StoreStats {
  customers: number;
  products: number;
  orders: number;
  items: number;
}
