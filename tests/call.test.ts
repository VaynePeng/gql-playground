import test from "node:test";
import assert from "node:assert/strict";
import { PracticeStore } from "../src/graphql/store";
import { createSeedData } from "../src/graphql/seed";
import { createSchema } from "../src/graphql/schema";
import { executeGql } from "../src/graphql/execute";
import { parseCall } from "../src/graphql/call";
import { readCatalog, starterDocument } from "../src/graphql/catalog";
import { migrateWorkspace } from "../src/storage/store";

const schema = createSchema();

function storeWithSeed() {
  return new PracticeStore(createSeedData());
}

async function run(source: string, call?: string) {
  return executeGql({
    schema,
    store: storeWithSeed(),
    source,
    call: call ?? "",
  });
}

test("query with no call still executes", async () => {
  const result = await run(`query {
    hello
    stats { customers }
  }`);
  assert.equal(result.errors, undefined);
  const data = result.data as { hello: string; stats: { customers: number } };
  assert.equal(data.hello, "Hello, GraphQL!");
  assert.equal(data.stats.customers, 24);
});

test("call binds scalar, enum and input arguments", async () => {
  const scalar = await run(
    `query GetCustomer($id: ID!) {
      customer(id: $id) { name email }
    }`,
    `GetCustomer(id: "1")`,
  );
  assert.equal(scalar.errors, undefined, scalar.errors?.[0]?.message);
  assert.match(
    (scalar.data as { customer: { name: string } }).customer.name,
    /林小满/,
  );

  const enumerated = await run(
    `query OrdersByStatus($status: OrderStatus, $withNote: Boolean!) {
      orders(status: $status, limit: 5) {
        id
        status
        note @include(if: $withNote)
      }
    }`,
    `OrdersByStatus(status: SHIPPED, withNote: true)`,
  );
  assert.equal(enumerated.errors, undefined, enumerated.errors?.[0]?.message);
  const orders = (
    enumerated.data as { orders: { status: string; note?: string | null }[] }
  ).orders;
  assert.ok(orders.length >= 1);
  assert.equal(orders[0].status, "SHIPPED");
  assert.ok("note" in orders[0]);

  const created = await executeGql({
    schema,
    store: storeWithSeed(),
    source: `mutation CreateCustomer($input: CreateCustomerInput!) {
      createCustomer(input: $input) { name city }
    }`,
    call: `CreateCustomer(input: { name: "Wei", city: "苏州" })`,
  });
  assert.equal(created.errors, undefined, created.errors?.[0]?.message);
  const customer = (
    created.data as { createCustomer: { name: string; city: string } }
  ).createCustomer;
  assert.equal(customer.name, "Wei");
  assert.equal(customer.city, "苏州");
});

test("call accepts the root field name and nameless argument lists", async () => {
  const byField = await run(
    `query GetCustomer($id: ID!) {
      customer(id: $id) { name }
    }`,
    `customer(id: "1")`,
  );
  assert.equal(byField.errors, undefined, byField.errors?.[0]?.message);

  const nameless = await run(
    `query ($id: ID!) {
      customer(id: $id) { name }
    }`,
    `(id: "1")`,
  );
  assert.equal(nameless.errors, undefined, nameless.errors?.[0]?.message);
});

test("missing required arguments return GraphQL-style errors with locations", async () => {
  const result = await run(
    `query GetCustomer($id: ID!) {
      customer(id: $id) { name }
    }`,
    `GetCustomer()`,
  );
  assert.ok(result.errors?.length);
  assert.match(result.errors?.[0].message || "", /\$id/);
  assert.match(result.errors?.[0].message || "", /ID!/);
  assert.equal(result.errors?.[0].locations?.[0].line, 1);
  assert.equal(result.errors?.[0].extensions?.source, "call");

  const emptyCall = await run(
    `query GetCustomer($id: ID!) {
      customer(id: $id) { name }
    }`,
    "",
  );
  assert.ok(emptyCall.errors?.length);
  assert.match(emptyCall.errors?.[0].message || "", /was not provided/);
});

test("type errors in the call are reported with locations", async () => {
  const wrongScalar = await run(
    `query GetCustomer($id: ID!) {
      customer(id: $id) { name }
    }`,
    `GetCustomer(id: true)`,
  );
  assert.ok(wrongScalar.errors?.length);
  assert.match(wrongScalar.errors?.[0].message || "", /\$id|ID/);
  assert.equal(wrongScalar.errors?.[0].locations?.[0].line, 1);
  assert.ok((wrongScalar.errors?.[0].locations?.[0].column || 0) > 1);

  const quotedEnum = await run(
    `query OrdersByStatus($status: OrderStatus) {
      orders(status: $status, limit: 1) { id }
    }`,
    `OrdersByStatus(status: "SHIPPED")`,
  );
  assert.ok(quotedEnum.errors?.length);
  assert.match(quotedEnum.errors?.[0].message || "", /OrderStatus/);
  assert.match(quotedEnum.errors?.[0].message || "", /unquoted|SHIPPED/);

  const badEnum = await run(
    `query OrdersByStatus($status: OrderStatus) {
      orders(status: $status, limit: 1) { id }
    }`,
    `OrdersByStatus(status: NOT_A_STATUS)`,
  );
  assert.ok(badEnum.errors?.length);
  assert.match(badEnum.errors?.[0].message || "", /NOT_A_STATUS|OrderStatus/);

  const missingInputField = await run(
    `mutation CreateCustomer($input: CreateCustomerInput!) {
      createCustomer(input: $input) { id }
    }`,
    `CreateCustomer(input: { city: "苏州" })`,
  );
  assert.ok(missingInputField.errors?.length);
  assert.match(missingInputField.errors?.[0].message || "", /name/);
});

test("call name selects among multiple operations", async () => {
  const source = `query GetCustomer($id: ID!) {
    customer(id: $id) { name }
  }
  query Hello { hello }`;

  const ambiguous = await run(source, "");
  assert.ok(ambiguous.errors?.length);
  assert.match(ambiguous.errors?.[0].message || "", /多个操作/);

  const picked = await run(source, `GetCustomer(id: "1")`);
  assert.equal(picked.errors, undefined, picked.errors?.[0]?.message);
  assert.match(
    (picked.data as { customer: { name: string } }).customer.name,
    /林小满/,
  );

  const other = await run(source, `Hello()`);
  assert.equal(other.errors, undefined, other.errors?.[0]?.message);
  assert.equal((other.data as { hello: string }).hello, "Hello, GraphQL!");
});

test("parseCall reports syntax locations relative to the call text", () => {
  const parsed = parseCall(`GetCustomer(id: )`);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.errors[0].locations?.[0].line, 1);
  assert.match(parsed.errors[0].message, /语法错误/);
});

test("inserted examples with arguments use a call statement", () => {
  const catalog = readCatalog(schema);
  const customer = starterDocument(catalog, {
    kind: "field",
    typeName: catalog.query.name,
    fieldName: "customer",
  });
  assert.match(customer?.query || "", /query GetCustomer\(\$id: ID!\)/);
  assert.match(customer?.query || "", /customer\(id: \$id\)/);
  assert.match(customer?.call || "", /GetCustomer\(id: "1"\)/);

  const hello = starterDocument(catalog, {
    kind: "field",
    typeName: catalog.query.name,
    fieldName: "hello",
  });
  assert.match(hello?.query || "", /hello/);
  assert.equal(hello?.call || "", "");

  const create = starterDocument(catalog, {
    kind: "field",
    typeName: catalog.mutation!.name,
    fieldName: "createCustomer",
  });
  assert.match(create?.query || "", /mutation CreateCustomer/);
  assert.match(create?.call || "", /CreateCustomer\(input:/);
});

test("old stored variables JSON is ignored without dropping the draft", () => {
  const restored = migrateWorkspace({
    databaseId: "keep-me",
    draft: "query { hello }\n",
    variables: `{ "id": "1" }`,
    variablesOpen: true,
    history: [
      {
        id: "h1",
        query: "query { hello }",
        variables: `{ "gone": true }`,
        scope: "全部",
        time: "2026-01-01T00:00:00.000Z",
        duration: 12,
        success: true,
        summary: "hello",
      },
    ],
    sidebar: 280,
    editorHeight: 40,
  });
  assert.equal(restored.databaseId, "keep-me");
  assert.equal(restored.draft, "query { hello }\n");
  assert.equal(restored.call, "");
  assert.equal(restored.history[0].call, "");
  assert.equal(restored.history[0].query, "query { hello }");
  assert.equal(restored.editorHeight, 40);
  assert.equal("variables" in restored, false);
  assert.equal("variablesOpen" in restored, false);
  assert.equal(migrateWorkspace({ editorHeight: 43 }).editorHeight, 56);
});
