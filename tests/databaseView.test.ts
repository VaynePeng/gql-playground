import test from "node:test";
import assert from "node:assert/strict";
import { readCatalog } from "../src/graphql/catalog";
import {
  describeDatabase,
  filterDatabaseView,
  formatCell,
  inputEntity,
  readCell,
  rowKey,
} from "../src/graphql/databaseView";
import { createSchema } from "../src/graphql/schema";
import { createSeedData, emptyData } from "../src/graphql/seed";
import { PracticeStore } from "../src/graphql/store";
import type { CustomerRow, PracticeData } from "../src/types";

const catalog = readCatalog(createSchema());

function table(data: PracticeData, key: "customers" | "products" | "orders" | "orderItems") {
  const view = describeDatabase(data, catalog);
  const found = view.tables.find((item) => item.key === key);
  assert.ok(found, key);
  return { view, table: found };
}

test("input names bind to the longest entity and do not alias OrderItem as Order", () => {
  assert.equal(inputEntity("OrderItemInput"), "OrderItem");
  assert.equal(inputEntity("CreateOrderInput"), "Order");
  assert.equal(inputEntity("UpdateOrderInput"), "Order");
  assert.equal(inputEntity("CreateCustomerInput"), "Customer");
  assert.equal(inputEntity("ID"), null);
  assert.equal(inputEntity("productId"), null);
});

test("practice tables expose document columns and live rows", () => {
  const data = createSeedData();
  const customers = table(data, "customers").table;
  const products = table(data, "products").table;
  const orders = table(data, "orders").table;
  const items = table(data, "orderItems").table;

  assert.deepEqual(
    customers.columns.map((column) => column.name),
    ["id", "name", "city", "email", "createdAt"],
  );
  assert.deepEqual(
    products.columns.map((column) => column.name),
    ["id", "name", "category", "price", "attributes"],
  );
  assert.deepEqual(
    orders.columns.map((column) => column.name),
    ["id", "customerId", "status", "total", "createdAt", "note"],
  );
  assert.deepEqual(
    items.columns.map((column) => column.name),
    ["id", "orderId", "productId", "quantity", "unitPrice"],
  );
  assert.equal(customers.rows.length, 24);
  assert.equal(products.rows.length, 6);
  assert.equal(orders.rows.length, 120);
  assert.equal(items.rows.length, 240);
  assert.equal(customers.rows[0]?.name, "林小满 1");
  assert.equal(products.rows[0]?.name, "机械键盘");
  assert.deepEqual(products.rows[0]?.attributes, { color: "green", wireless: true });
});

test("stored foreign keys stay on their own fields", () => {
  const data = createSeedData();
  const order = table(data, "orders").table.rows[0];
  const item = table(data, "orderItems").table.rows[0];
  assert.ok(order);
  assert.ok(item);
  assert.equal(order.customerId, 1);
  assert.equal("customer" in order, false);
  assert.equal("customer_id" in order, false);
  assert.equal(typeof item.orderId, "number");
  assert.equal(typeof item.productId, "number");
  assert.equal("order" in item, false);
  assert.equal("product" in item, false);
  assert.equal("order_id" in item, false);
  assert.equal("product_id" in item, false);

  const orders = table(data, "orders").table;
  assert.equal(
    orders.columns.find((column) => column.name === "customerId")?.graphqlType,
    null,
  );
  assert.equal(orders.columns.find((column) => column.name === "customerId")?.preview, false);
  assert.deepEqual(
    orders.columns.filter((column) => column.preview).map((column) => column.name),
    ["id", "status", "total"],
  );
  assert.equal(
    orders.columns.find((column) => column.name === "status")?.graphqlType,
    "OrderStatus!",
  );
  const items = table(data, "orderItems").table;
  assert.equal(items.columns.find((column) => column.name === "productId")?.graphqlType, null);
  assert.equal(items.columns.find((column) => column.name === "quantity")?.graphqlType, "Int!");
});

test("null stays null and a missing key is not filled from another field", () => {
  const data = createSeedData();
  const cityless = table(data, "customers").table.rows.find((row) => row.id === 5);
  assert.ok(cityless);
  assert.equal(Object.prototype.hasOwnProperty.call(cityless, "city"), true);
  assert.equal(cityless.city, null);
  assert.equal(formatCell(cityless.city), "null");

  const partial = emptyData();
  partial.customers = [
    { id: 7, name: "仅姓名", nickname: "不要当成别的字段" } as unknown as CustomerRow,
  ];
  const customers = table(partial, "customers").table;
  assert.deepEqual(
    customers.columns.map((column) => column.name),
    ["id", "name", "city", "email", "createdAt", "nickname"],
  );
  const row = customers.rows[0];
  assert.ok(row);
  assert.equal(readCell(row, "name"), "仅姓名");
  assert.equal(readCell(row, "nickname"), "不要当成别的字段");
  assert.equal(readCell(row, "email"), undefined);
  assert.equal(readCell(row, "username"), undefined);
  assert.equal(readCell(row, "city"), undefined);
  assert.equal(formatCell(undefined), "");
  assert.equal(rowKey(row, 0), "id:7");
  assert.equal(rowKey({ name: "没有 id" }, 3), "index:3");
});

test("operations hang off the table they read or write", () => {
  const view = describeDatabase(createSeedData(), catalog);
  const labels = (key: "customers" | "products" | "orders" | "orderItems", kind: "query" | "mutation") =>
    view.tables
      .find((item) => item.key === key)!
      .actions.filter((action) => action.kind === kind)
      .map((action) => action.label);

  assert.deepEqual(labels("customers", "query"), ["customer", "customers", "Order.customer"]);
  assert.deepEqual(labels("customers", "mutation"), ["createCustomer"]);
  assert.deepEqual(labels("products", "query"), ["product", "products", "OrderItem.product"]);
  assert.deepEqual(labels("products", "mutation"), []);
  assert.deepEqual(labels("orders", "query"), ["order", "orders", "Customer.orders"]);
  assert.deepEqual(labels("orders", "mutation"), ["updateOrder", "createOrder", "cancelOrder"]);
  assert.deepEqual(labels("orderItems", "query"), ["Order.items"]);
  assert.deepEqual(labels("orderItems", "mutation"), ["createOrder"]);
  assert.deepEqual(
    view.other.map((action) => action.label),
    ["hello", "stats", "search"],
  );
  assert.equal(
    view.tables.some((item) => item.title === "Query" || item.title === "Mutation"),
    false,
  );
});

test("empty practice data keeps the table shape and zero rows", () => {
  const view = describeDatabase(emptyData(), catalog);
  assert.deepEqual(
    view.tables.map((item) => [item.collection, item.rows.length]),
    [
      ["customers", 0],
      ["products", 0],
      ["orders", 0],
      ["orderItems", 0],
    ],
  );
  assert.deepEqual(
    view.tables[0]?.columns.map((column) => column.name),
    ["id", "name", "city", "email", "createdAt"],
  );
  assert.ok(view.tables[0]?.actions.some((action) => action.fieldName === "createCustomer"));
});

test("search matches table text or cell values without renaming fields", () => {
  const view = describeDatabase(createSeedData(), catalog);
  const byName = filterDatabaseView(view, "learner1@example.test");
  assert.equal(byName.tables.length, 1);
  assert.equal(byName.tables[0]?.key, "customers");
  assert.equal(byName.tables[0]?.rows.length, 1);
  assert.equal(byName.tables[0]?.rows[0]?.name, "林小满 1");
  assert.equal(byName.tables[0]?.rows[0]?.email, "learner1@example.test");
  assert.equal(byName.tables[0]?.total, 24);

  const byColumn = filterDatabaseView(view, "customerId");
  assert.deepEqual(
    byColumn.tables.map((item) => item.key),
    ["orders"],
  );
  assert.equal(byColumn.tables[0]?.rows.length, 120);

  const none = filterDatabaseView(view, "username");
  assert.equal(none.tables.length, 0);
  assert.equal(none.other.length, 0);
});

test("mutations show up in the next database view", () => {
  const store = new PracticeStore(createSeedData());
  store.createCustomer({ name: "侧栏新客户", city: "南京", email: "sidebar@example.test" });
  store.cancelOrder("1");
  store.createOrder({
    customerId: "1",
    note: "加一行",
    items: [{ productId: "2", quantity: 3 }],
  });
  const view = describeDatabase(store.snapshot(), catalog);
  const customers = view.tables.find((item) => item.key === "customers")!;
  const created = customers.rows.at(-1);
  assert.equal(customers.rows.length, 25);
  assert.equal(created?.name, "侧栏新客户");
  assert.equal(created?.email, "sidebar@example.test");
  assert.equal(created?.city, "南京");
  assert.equal("nickname" in (created ?? {}), false);

  const orders = view.tables.find((item) => item.key === "orders")!;
  assert.equal(orders.rows.find((row) => row.id === 1)?.status, "CANCELLED");
  const added = orders.rows.at(-1);
  assert.equal(added?.customerId, 1);
  assert.equal(added?.note, "加一行");
  assert.equal(added?.status, "PENDING");

  const items = view.tables.find((item) => item.key === "orderItems")!;
  assert.equal(items.rows.length, 241);
  const item = items.rows.at(-1);
  assert.equal(item?.productId, 2);
  assert.equal(item?.quantity, 3);
  assert.equal(item?.unitPrice, 89);
  assert.equal("product" in (item ?? {}), false);
});
