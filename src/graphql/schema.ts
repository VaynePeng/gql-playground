import {
  buildSchema,
  GraphQLError,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLUnionType,
  type GraphQLFieldResolver,
} from "graphql";
import type { PracticeStore } from "./store";
import type { CustomerRow, OrderStatus, ProductRow } from "../types";

export type GqlContext = { store: PracticeStore };

export const typeDefs = /* GraphQL */ `
  """任意 JSON 值，用于商品属性。"""
  scalar JSON

  """订单状态，按业务流转顺序排列。"""
  enum OrderStatus {
    """待支付"""
    PENDING
    """已支付"""
    PAID
    """已发货"""
    SHIPPED
    """已完成"""
    COMPLETED
    """已取消"""
    CANCELLED
  }

  """当前练习库的数量统计。"""
  type StoreStats {
    customers: Int!
    products: Int!
    orders: Int!
    items: Int!
  }

  """练习数据 · 客户"""
  type Customer {
    id: ID!
    """客户姓名"""
    name: String!
    city: String
    email: String
    createdAt: String!
    """该客户的订单，可按状态过滤"""
    orders(status: OrderStatus, limit: Int): [Order!]!
  }

  """练习数据 · 商品"""
  type Product {
    id: ID!
    name: String!
    category: String!
    price: Float!
    attributes: JSON
  }

  """订单中的一行商品"""
  type OrderItem {
    id: ID!
    quantity: Int!
    unitPrice: Float!
    product: Product!
  }

  """练习数据 · 订单"""
  type Order {
    id: ID!
    status: OrderStatus!
    total: Float!
    createdAt: String!
    note: String
    customer: Customer!
    items: [OrderItem!]!
  }

  """按关键字搜索时可能返回客户或商品。"""
  union SearchResult = Customer | Product

  input CreateCustomerInput {
    name: String!
    city: String
    email: String
  }

  input UpdateOrderInput {
    status: OrderStatus
    note: String
  }

  input OrderItemInput {
    productId: ID!
    quantity: Int!
  }

  input CreateOrderInput {
    customerId: ID!
    items: [OrderItemInput!]!
    note: String
  }

  type Query {
    """简单标量，用于确认执行环境。"""
    hello: String!
    """练习库规模。载入手册后才会有订单数据。"""
    stats: StoreStats!
    customer(id: ID!): Customer
    """客户列表，可用城市或关键字过滤。"""
    customers(city: String, search: String, limit: Int): [Customer!]!
    product(id: ID!): Product
    products(category: String, limit: Int): [Product!]!
    order(id: ID!): Order
    """订单列表，可按状态、客户和金额过滤。"""
    orders(
      status: OrderStatus
      customerId: ID
      minTotal: Float
      limit: Int
    ): [Order!]!
    """同时搜索客户姓名/城市与商品名称/分类。"""
    search(keyword: String!): [SearchResult!]!
  }

  type Mutation {
    """新增客户，邮箱需唯一。"""
    createCustomer(input: CreateCustomerInput!): Customer!
    """更新订单状态或备注。"""
    updateOrder(id: ID!, input: UpdateOrderInput!): Order!
    """创建订单；总金额按当前商品价格计算并写入练习库。"""
    createOrder(input: CreateOrderInput!): Order!
    """将订单标记为已取消；已取消的订单会返回业务错误。"""
    cancelOrder(id: ID!): Order!
  }
`;

type Resolver<TSource = unknown> = GraphQLFieldResolver<TSource, GqlContext>;

function bind(
  type: GraphQLObjectType<any, GqlContext>,
  resolvers: Record<string, Resolver<any>>,
) {
  const fields = type.getFields();
  for (const [name, resolve] of Object.entries(resolvers)) {
    const field = fields[name];
    if (!field) throw new Error(`Schema 缺少字段 ${type.name}.${name}`);
    field.resolve = resolve;
  }
}

export function createSchema(): GraphQLSchema {
  const schema = buildSchema(typeDefs) as GraphQLSchema;
  const query = schema.getQueryType();
  const mutation = schema.getMutationType();
  if (!query || !mutation) throw new Error("Schema 需要 Query 与 Mutation");

  bind(query, {
    hello: () => "Hello, GraphQL!",
    stats: (_src, _args, { store }) => store.stats(),
    customer: (_src, args, { store }) => {
      try {
        return store.requireCustomer(String(args.id));
      } catch (error) {
        if (error instanceof GraphQLError && error.extensions?.code === "NOT_FOUND")
          return null;
        throw error;
      }
    },
    customers: (_src, args, { store }) =>
      store.listCustomers({
        city: args.city as string | null,
        search: args.search as string | null,
        limit: args.limit as number | null,
      }),
    product: (_src, args, { store }) => {
      try {
        return store.requireProduct(String(args.id));
      } catch (error) {
        if (error instanceof GraphQLError && error.extensions?.code === "NOT_FOUND")
          return null;
        throw error;
      }
    },
    products: (_src, args, { store }) =>
      store.listProducts(args.category as string | null, args.limit as number | null),
    order: (_src, args, { store }) => {
      try {
        return store.requireOrder(String(args.id));
      } catch (error) {
        if (error instanceof GraphQLError && error.extensions?.code === "NOT_FOUND")
          return null;
        throw error;
      }
    },
    orders: (_src, args, { store }) =>
      store.listOrders({
        status: args.status as OrderStatus | null,
        customerId: args.customerId as string | null,
        minTotal: args.minTotal as number | null,
        limit: args.limit as number | null,
      }),
    search: (_src, args, { store }) => store.search(String(args.keyword)),
  });

  bind(mutation, {
    createCustomer: (_src, args, { store }) =>
      store.createCustomer(args.input as { name: string; city?: string; email?: string }),
    updateOrder: (_src, args, { store }) =>
      store.updateOrder(
        String(args.id),
        args.input as { status?: OrderStatus; note?: string | null },
      ),
    createOrder: (_src, args, { store }) =>
      store.createOrder(
        args.input as {
          customerId: string;
          items: { productId: string; quantity: number }[];
          note?: string | null;
        },
      ),
    cancelOrder: (_src, args, { store }) => store.cancelOrder(String(args.id)),
  });

  bind(schema.getType("Customer") as GraphQLObjectType<CustomerRow, GqlContext>, {
    orders: (customer, args, { store }) =>
      store.ordersForCustomer(
        customer.id,
        args.status as OrderStatus | null,
        args.limit as number | null,
      ),
  });

  bind(schema.getType("Order") as GraphQLObjectType, {
    customer: (order, _args, { store }) => {
      const row = store.getCustomer((order as { customerId: number }).customerId);
      if (!row) {
        throw new GraphQLError("订单缺少对应客户", {
          extensions: { code: "INTERNAL" },
        });
      }
      return row;
    },
    items: (order, _args, { store }) =>
      store.itemsForOrder((order as { id: number }).id),
  });

  bind(schema.getType("OrderItem") as GraphQLObjectType, {
    product: (item, _args, { store }) => {
      const row = store.getProduct((item as { productId: number }).productId);
      if (!row) {
        throw new GraphQLError("订单项缺少对应商品", {
          extensions: { code: "INTERNAL" },
        });
      }
      return row;
    },
  });

  const searchResult = schema.getType("SearchResult") as GraphQLUnionType;
  searchResult.resolveType = (value) => {
    if (value && typeof value === "object" && "price" in value) return "Product";
    if (value && typeof value === "object" && "email" in (value as CustomerRow))
      return "Customer";
    return undefined;
  };

  return schema;
}

let cached: GraphQLSchema | undefined;
export function getSchema() {
  cached ??= createSchema();
  return cached;
}

export function isCustomerRow(value: unknown): value is CustomerRow {
  return Boolean(
    value &&
      typeof value === "object" &&
      "name" in value &&
      "email" in value &&
      !("price" in value),
  );
}

export function isProductRow(value: unknown): value is ProductRow {
  return Boolean(value && typeof value === "object" && "price" in value && "category" in value);
}
