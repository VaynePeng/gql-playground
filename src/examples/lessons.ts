export const initialQuery = `# 欢迎来到你的 GraphQL 实验室。
# 直接运行试试，或点击「练习手册」载入订单数据。

query {
  hello
  stats {
    customers
    products
    orders
  }
}
`;

export const initialVariables = `{
}
`;

export const lessons = [
  {
    title: "第一条查询",
    level: "01 · 入门",
    description: "选择标量与对象字段",
    query: `query FirstQuery {
  products {
    id
    name
    category
    price
  }
}
`,
    variables: `{
}
`,
  },
  {
    title: "参数与过滤",
    level: "02 · 参数",
    description: "用参数缩小结果集",
    query: `query FilterOrders {
  orders(status: PAID, minTotal: 500, limit: 10) {
    id
    status
    total
    createdAt
  }
}
`,
    variables: `{
}
`,
  },
  {
    title: "嵌套关系",
    level: "03 · 关联",
    description: "客户 → 订单 → 明细 → 商品",
    query: `query NestedRelations {
  customers(limit: 4) {
    name
    city
    orders(limit: 2) {
      id
      status
      total
      items {
        quantity
        unitPrice
        product {
          name
          price
        }
      }
    }
  }
}
`,
    variables: `{
}
`,
  },
  {
    title: "别名",
    level: "04 · 别名",
    description: "同一字段查询两次",
    query: `query Aliases {
  stationery: products(category: "文具") {
    name
    price
  }
  digital: products(category: "数码") {
    name
    price
  }
}
`,
    variables: `{
}
`,
  },
  {
    title: "片段",
    level: "05 · 片段",
    description: "复用选择集，也可配合联合类型",
    query: `fragment OrderSummary on Order {
  id
  status
  total
}

query Fragments {
  orders(limit: 8) {
    ...OrderSummary
    customer {
      name
    }
  }
  search(keyword: "林") {
    __typename
    ... on Customer {
      id
      name
      city
    }
    ... on Product {
      id
      name
      price
    }
  }
}
`,
    variables: `{
}
`,
  },
  {
    title: "变量与指令",
    level: "06 · 变量",
    description: "JSON 变量编辑器，配合 @include",
    query: `query Variables($status: OrderStatus, $withNote: Boolean!) {
  orders(status: $status, limit: 12) {
    id
    status
    total
    note @include(if: $withNote)
  }
}
`,
    variables: `{
  "status": "SHIPPED",
  "withNote": true
}
`,
  },
  {
    title: "变更会留下来",
    level: "07 · 变更",
    description: "创建客户，再查询确认已写入",
    query: `mutation CreateCustomer {
  createCustomer(
    input: {
      name: "练习同学"
      city: "苏州"
      email: "practice.learner@example.test"
    }
  ) {
    id
    name
    city
    email
  }
}

# 选中下面这段单独运行，确认 mutation 已写入本地练习库：
# query FindPracticeCustomer {
#   customers(search: "练习同学") {
#     id
#     name
#     email
#   }
# }
`,
    variables: `{
}
`,
  },
  {
    title: "输入类型与枚举",
    level: "08 · 输入",
    description: "嵌套 input 与 OrderStatus",
    query: `mutation PlaceOrder {
  createOrder(
    input: {
      customerId: "1"
      note: "手册练习"
      items: [
        { productId: "1", quantity: 1 }
        { productId: "4", quantity: 2 }
      ]
    }
  ) {
    id
    status
    total
    note
    items {
      quantity
      product {
        name
      }
    }
  }
}

# 也可以把已有订单改成枚举值 SHIPPED：
# mutation UpdateStatus {
#   updateOrder(id: "1", input: { status: SHIPPED, note: "已发货" }) {
#     id
#     status
#     note
#   }
# }
`,
    variables: `{
}
`,
  },
  {
    title: "认识错误",
    level: "09 · 错误",
    description: "校验错误会带上 locations",
    query: `query ValidationError {
  products {
    id
    notARealField
  }
}

# 业务错误示例（种子数据里 id=5 的订单已是 CANCELLED）：
# mutation {
#   cancelOrder(id: "5") {
#     id
#     status
#   }
# }
`,
    variables: `{
}
`,
  },
];
