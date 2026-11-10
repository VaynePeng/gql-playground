import { GraphQLError } from "graphql";
import type {
  CustomerRow,
  OrderItemRow,
  OrderRow,
  OrderStatus,
  PracticeData,
  ProductRow,
  StoreStats,
} from "../types";
import { createSeedData, emptyData } from "./seed";

export interface CustomerFilter {
  city?: string | null;
  search?: string | null;
  limit?: number | null;
}

export interface OrderFilter {
  status?: OrderStatus | null;
  customerId?: string | null;
  minTotal?: number | null;
  limit?: number | null;
}

export interface CreateCustomerInput {
  name: string;
  city?: string | null;
  email?: string | null;
}

export interface UpdateOrderInput {
  status?: OrderStatus | null;
  note?: string | null;
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  customerId: string;
  items: OrderItemInput[];
  note?: string | null;
}

function take<T>(rows: T[], limit?: number | null) {
  if (limit == null) return rows;
  return rows.slice(0, Math.max(0, limit));
}

function parseId(id: string, label: string) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new GraphQLError(`${label} id 无效：${id}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return n;
}

function missing(label: string, id: string): never {
  throw new GraphQLError(`${label} ${id} 不存在`, {
    extensions: { code: "NOT_FOUND" },
  });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export class PracticeStore {
  data: PracticeData;

  constructor(data?: PracticeData) {
    this.data = data ? structuredClone(data) : emptyData();
  }

  snapshot(): PracticeData {
    return structuredClone(this.data);
  }

  load(data: PracticeData) {
    this.data = structuredClone(data);
  }

  seed() {
    this.data = createSeedData();
  }

  clear() {
    this.data = emptyData();
  }

  stats(): StoreStats {
    return {
      customers: this.data.customers.length,
      products: this.data.products.length,
      orders: this.data.orders.length,
      items: this.data.orderItems.length,
    };
  }

  getCustomer(id: number) {
    return this.data.customers.find((row) => row.id === id);
  }

  getProduct(id: number) {
    return this.data.products.find((row) => row.id === id);
  }

  getOrder(id: number) {
    return this.data.orders.find((row) => row.id === id);
  }

  requireCustomer(id: string) {
    return this.getCustomer(parseId(id, "客户")) ?? missing("客户", id);
  }

  requireProduct(id: string) {
    return this.getProduct(parseId(id, "商品")) ?? missing("商品", id);
  }

  requireOrder(id: string) {
    return this.getOrder(parseId(id, "订单")) ?? missing("订单", id);
  }

  listCustomers(filter: CustomerFilter = {}) {
    let rows = this.data.customers;
    if (filter.city) rows = rows.filter((row) => row.city === filter.city);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      rows = rows.filter(
        (row) =>
          row.name.toLowerCase().includes(q) ||
          (row.email && row.email.toLowerCase().includes(q)) ||
          (row.city && row.city.toLowerCase().includes(q)),
      );
    }
    return take(rows, filter.limit);
  }

  listProducts(category?: string | null, limit?: number | null) {
    let rows = this.data.products;
    if (category) rows = rows.filter((row) => row.category === category);
    return take(rows, limit);
  }

  listOrders(filter: OrderFilter = {}) {
    let rows = this.data.orders;
    if (filter.status) rows = rows.filter((row) => row.status === filter.status);
    if (filter.customerId) {
      const customerId = parseId(filter.customerId, "客户");
      rows = rows.filter((row) => row.customerId === customerId);
    }
    if (filter.minTotal != null) {
      rows = rows.filter((row) => row.total >= filter.minTotal!);
    }
    return take(rows, filter.limit);
  }

  ordersForCustomer(
    customerId: number,
    status?: OrderStatus | null,
    limit?: number | null,
  ) {
    let rows = this.data.orders.filter((row) => row.customerId === customerId);
    if (status) rows = rows.filter((row) => row.status === status);
    return take(rows, limit);
  }

  itemsForOrder(orderId: number) {
    return this.data.orderItems.filter((row) => row.orderId === orderId);
  }

  search(keyword: string) {
    const q = keyword.trim().toLowerCase();
    if (!q) return [] as Array<CustomerRow | ProductRow>;
    const customers = this.data.customers.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.email && row.email.toLowerCase().includes(q)) ||
        (row.city && row.city.toLowerCase().includes(q)),
    );
    const products = this.data.products.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q),
    );
    return [...customers, ...products];
  }

  createCustomer(input: CreateCustomerInput) {
    const name = input.name.trim();
    if (!name) {
      throw new GraphQLError("客户姓名不能为空", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    const email = input.email?.trim() || null;
    if (email && this.data.customers.some((row) => row.email === email)) {
      throw new GraphQLError(`邮箱 ${email} 已被使用`, {
        extensions: { code: "BUSINESS" },
      });
    }
    const row: CustomerRow = {
      id: this.data.nextIds.customer++,
      name,
      city: input.city?.trim() || null,
      email,
      createdAt: new Date().toISOString(),
    };
    this.data.customers.push(row);
    return row;
  }

  updateOrder(id: string, input: UpdateOrderInput) {
    const order = this.requireOrder(id);
    if (input.status) order.status = input.status;
    if (input.note !== undefined) order.note = input.note;
    return order;
  }

  createOrder(input: CreateOrderInput) {
    const customer = this.requireCustomer(input.customerId);
    if (!input.items.length) {
      throw new GraphQLError("订单至少需要一个商品", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
    const orderId = this.data.nextIds.order++;
    const items: OrderItemRow[] = [];
    let total = 0;
    for (const item of input.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new GraphQLError("数量必须是大于 0 的整数", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      const product = this.requireProduct(item.productId);
      const row: OrderItemRow = {
        id: this.data.nextIds.item++,
        orderId,
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
      };
      items.push(row);
      total += row.quantity * row.unitPrice;
    }
    this.data.orderItems.push(...items);
    const order: OrderRow = {
      id: orderId,
      customerId: customer.id,
      status: "PENDING",
      total: round2(total),
      createdAt: new Date().toISOString(),
      note: input.note ?? null,
    };
    this.data.orders.push(order);
    return order;
  }

  cancelOrder(id: string) {
    const order = this.requireOrder(id);
    if (order.status === "CANCELLED") {
      throw new GraphQLError("订单已取消，无法再次取消", {
        extensions: { code: "BUSINESS" },
      });
    }
    order.status = "CANCELLED";
    return order;
  }
}
