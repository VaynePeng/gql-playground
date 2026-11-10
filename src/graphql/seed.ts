import type {
  CustomerRow,
  OrderItemRow,
  OrderRow,
  OrderStatus,
  PracticeData,
  ProductRow,
} from "../types";

const NAMES = ["林小满", "陈远", "周可", "许知夏", "方舟", "沈清", "陆遥", "赵一"];
const CITIES = ["上海", "杭州", "成都", "深圳", null] as const;
const STATUSES: OrderStatus[] = [
  "PENDING",
  "PAID",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
];

const PRODUCT_SEED: Omit<ProductRow, "id">[] = [
  {
    name: "机械键盘",
    category: "数码",
    price: 399,
    attributes: { color: "green", wireless: true },
  },
  {
    name: "帆布包",
    category: "生活",
    price: 89,
    attributes: { color: "cream" },
  },
  {
    name: "手冲壶",
    category: "生活",
    price: 199,
    attributes: { capacity: 600 },
  },
  {
    name: "SQL 笔记本",
    category: "文具",
    price: 39,
    attributes: { pages: 128 },
  },
  {
    name: "桌面台灯",
    category: "数码",
    price: 259,
    attributes: { dimmable: true },
  },
  {
    name: "钢笔",
    category: "文具",
    price: 129,
    attributes: { color: "black" },
  },
];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function emptyData(): PracticeData {
  return {
    version: 1,
    example: false,
    customers: [],
    products: [],
    orders: [],
    orderItems: [],
    nextIds: { customer: 1, product: 1, order: 1, item: 1 },
  };
}

export function createSeedData(): PracticeData {
  const customers: CustomerRow[] = [];
  for (let i = 1; i <= 24; i++) {
    customers.push({
      id: i,
      name: `${NAMES[(i - 1) % NAMES.length]} ${i}`,
      city: CITIES[(i - 1) % CITIES.length] ?? null,
      email: `learner${i}@example.test`,
      createdAt: "2026-08-01T00:00:00.000Z",
    });
  }

  const products: ProductRow[] = PRODUCT_SEED.map((p, i) => ({
    id: i + 1,
    ...p,
  }));

  const origin = Date.parse("2026-09-01T00:00:00.000Z");
  const orders: OrderRow[] = [];
  const orderItems: OrderItemRow[] = [];
  let itemId = 1;
  for (let i = 1; i <= 120; i++) {
    const productA = products[(i - 1) % 6];
    const productB = products[i % 6];
    const quantity = 1 + (i % 3);
    const items = [productA, productB].map((product) => {
      const row: OrderItemRow = {
        id: itemId++,
        orderId: i,
        productId: product.id,
        quantity,
        unitPrice: product.price,
      };
      return row;
    });
    orderItems.push(...items);
    const total = round2(
      items.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0),
    );
    orders.push({
      id: i,
      customerId: ((i - 1) % 24) + 1,
      status: STATUSES[(i - 1) % STATUSES.length],
      total,
      createdAt: new Date(origin + i * 7 * 3600 * 1000).toISOString(),
      note: i % 7 === 0 ? "请周末配送" : null,
    });
  }

  return {
    version: 1,
    example: true,
    customers,
    products,
    orders,
    orderItems,
    nextIds: {
      customer: 25,
      product: 7,
      order: 121,
      item: itemId,
    },
  };
}

export const seedSummary = "24 位客户、6 件商品与 120 笔订单";
