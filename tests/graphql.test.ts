import test from "node:test";
import assert from "node:assert/strict";
import { PracticeStore } from "../src/graphql/store";
import { createSeedData, emptyData } from "../src/graphql/seed";
import { createSchema } from "../src/graphql/schema";
import { executeGql } from "../src/graphql/execute";
import { readCatalog, starterDocument } from "../src/graphql/catalog";
import { lessons } from "../src/examples/lessons";
import { packSnapshot, unpackSnapshot } from "../src/storage/snapshot";

const schema = createSchema();

function storeWithSeed() {
  return new PracticeStore(createSeedData());
}

async function run(
  source: string,
  practice = storeWithSeed(),
  variableValues?: Record<string, unknown>,
) {
  return {
    practice,
    result: await executeGql({
      schema,
      store: practice,
      source,
      variableValues,
    }),
  };
}

test("catalog exposes query, mutation, nested args and ordered enum values", () => {
  const catalog = readCatalog(schema);
  assert.ok(catalog.query.fields.some((field) => field.name === "customers"));
  assert.ok(catalog.mutation?.fields.some((field) => field.name === "createOrder"));
  const customer = catalog.types.find((type) => type.name === "Customer");
  const orders = customer?.fields.find((field) => field.name === "orders");
  assert.ok(orders?.args.some((arg) => arg.name === "status"));
  const status = catalog.types.find((type) => type.name === "OrderStatus");
  assert.deepEqual(
    status?.enumValues.map((value) => value.name),
    ["PENDING", "PAID", "SHIPPED", "COMPLETED", "CANCELLED"],
  );
  const inserted = starterDocument(catalog, {
    kind: "field",
    typeName: catalog.query.name,
    fieldName: "products",
  });
  assert.match(inserted || "", /products/);
});

test("seed data matches the practice handbook scale", () => {
  const stats = storeWithSeed().stats();
  assert.equal(stats.customers, 24);
  assert.equal(stats.products, 6);
  assert.equal(stats.orders, 120);
  assert.equal(stats.items, 240);
});

test("nested customer → orders → items → product resolves from the store", async () => {
  const { result } = await run(`query {
    customer(id: "1") {
      name
      orders(limit: 2) {
        id
        items {
          quantity
          product { name }
        }
      }
    }
  }`);
  assert.equal(result.errors, undefined);
  const customer = (result.data as { customer: { name: string; orders: unknown[] } })
    .customer;
  assert.match(customer.name, /林小满/);
  assert.equal(customer.orders.length, 2);
  const first = customer.orders[0] as {
    items: { product: { name: string } }[];
  };
  assert.ok(first.items.length >= 1);
  assert.equal(typeof first.items[0].product.name, "string");
});

test("aliases, fragments and union search results work together", async () => {
  const { result } = await run(`fragment ProductCard on Product {
    name
    price
  }
  query {
    stationery: products(category: "文具") { ...ProductCard }
    search(keyword: "林") {
      __typename
      ... on Customer { name }
      ... on Product { name }
    }
  }`);
  assert.equal(result.errors, undefined);
  const data = result.data as {
    stationery: { name: string }[];
    search: { __typename: string }[];
  };
  assert.ok(data.stationery.length >= 1);
  assert.ok(data.search.some((row) => row.__typename === "Customer"));
});

test("variables and @include/@skip change the payload", async () => {
  const included = await run(
    `query Vars($status: OrderStatus, $withNote: Boolean!) {
      orders(status: $status, limit: 5) {
        id
        note @include(if: $withNote)
      }
    }`,
    storeWithSeed(),
    { status: "SHIPPED", withNote: true },
  );
  assert.equal(included.result.errors, undefined);
  const withNote = (
    included.result.data as { orders: { note?: string | null }[] }
  ).orders[0];
  assert.ok("note" in withNote);

  const skipped = await run(
    `query Vars($status: OrderStatus, $withNote: Boolean!) {
      orders(status: $status, limit: 5) {
        id
        note @include(if: $withNote)
      }
    }`,
    storeWithSeed(),
    { status: "SHIPPED", withNote: false },
  );
  const withoutNote = (
    skipped.result.data as { orders: Record<string, unknown>[] }
  ).orders[0];
  assert.equal("note" in withoutNote, false);
});

test("mutations persist in the in-memory store and are visible to later queries", async () => {
  const practice = storeWithSeed();
  const created = await executeGql({
    schema,
    store: practice,
    source: `mutation {
      createCustomer(input: { name: "持久化同学", city: "苏州", email: "persist@example.test" }) {
        id
        name
      }
    }`,
  });
  assert.equal(created.errors, undefined);
  const id = (created.data as { createCustomer: { id: string } }).createCustomer
    .id;
  const found = await executeGql({
    schema,
    store: practice,
    source: `{ customers(search: "持久化") { id name email } }`,
  });
  const rows = (found.data as { customers: { id: string; email: string }[] })
    .customers;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, id);
  assert.equal(practice.stats().customers, 25);
});

test("validation errors include locations; business errors keep a path", async () => {
  const invalid = await run(`query {
    products { notARealField }
  }`);
  assert.ok(invalid.result.errors?.length);
  assert.ok(invalid.result.errors?.[0].locations?.[0].line);
  assert.match(invalid.result.errors?.[0].message || "", /notARealField|Cannot query/);

  const business = await run(`mutation { cancelOrder(id: "5") { id status } }`);
  assert.ok(business.result.errors?.length);
  assert.match(business.result.errors?.[0].message || "", /已取消/);
  assert.equal(business.result.errors?.[0].extensions?.code, "BUSINESS");
});

test("multiple operations without a selected name return a clear error", async () => {
  const { result } = await run(`query A { hello }
  query B { stats { customers } }`);
  assert.ok(result.errors?.length);
  assert.match(result.errors?.[0].message || "", /多个操作/);
});

test("practice lessons execute; the error lesson is a real validation failure", async () => {
  const practice = storeWithSeed();
  for (const lesson of lessons) {
    const result = await executeGql({
      schema,
      store: practice,
      source: lesson.query,
      variableValues: JSON.parse(lesson.variables.trim() || "{}"),
    });
    if (lesson.title === "认识错误") {
      assert.ok(result.errors?.length, lesson.title);
      assert.ok(result.errors?.[0].locations?.length);
    } else {
      assert.equal(result.errors, undefined, `${lesson.title}: ${result.errors?.[0]?.message}`);
    }
  }
});

test("empty store can be seeded and snapshot round-trips the order count", async () => {
  const practice = new PracticeStore(emptyData());
  assert.equal(practice.stats().orders, 0);
  practice.seed();
  assert.equal(practice.stats().orders, 120);
  const file = new File(
    [packSnapshot(practice.snapshot(), "graphql-js test")],
    "demo.gqlplay",
  );
  const restored = await unpackSnapshot(file, "graphql-js test");
  assert.equal(restored.orders.length, 120);
  assert.equal(restored.example, true);
  await assert.rejects(
    unpackSnapshot(file, "different-engine"),
    /版本|引擎/,
  );
});
