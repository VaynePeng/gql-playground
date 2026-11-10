import {
  GraphQLSchema,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isLeafType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isUnionType,
  type GraphQLArgument,
  type GraphQLField,
  type GraphQLInputField,
  type GraphQLNamedType,
  type GraphQLType,
} from "graphql";
import type {
  ArgInfo,
  Catalog,
  FieldInfo,
  SchemaKind,
  SchemaNode,
  TypeInfo,
} from "../types";

const HIDDEN = new Set(["__Schema", "__Type", "__TypeKind", "__Field", "__InputValue", "__EnumValue", "__Directive", "__DirectiveLocation"]);

export function typeString(type: GraphQLType): string {
  if (isNonNullType(type)) return `${typeString(type.ofType)}!`;
  if (isListType(type)) return `[${typeString(type.ofType)}]`;
  return type.name;
}

export function namedTypeName(type: GraphQLType) {
  return getNamedType(type).name;
}

function argInfo(arg: GraphQLArgument): ArgInfo {
  return {
    name: arg.name,
    type: typeString(arg.type),
    nullable: !isNonNullType(arg.type),
    defaultValue: arg.defaultValue === undefined ? null : JSON.stringify(arg.defaultValue),
    description: arg.description ?? null,
  };
}

function fieldInfo(field: GraphQLField<unknown, unknown> | GraphQLInputField): FieldInfo {
  const args = "args" in field ? field.args.map(argInfo) : [];
  const type = field.type;
  return {
    name: field.name,
    description: field.description ?? null,
    type: typeString(type),
    namedType: namedTypeName(type),
    nullable: !isNonNullType(type),
    args,
    isLeaf: isLeafType(getNamedType(type)),
  };
}

function kindOf(type: GraphQLNamedType): SchemaKind {
  if (isEnumType(type)) return "enum";
  if (isInputObjectType(type)) return "input";
  if (isUnionType(type)) return "union";
  if (isInterfaceType(type)) return "interface";
  if (isScalarType(type)) return "scalar";
  return "object";
}

function typeInfo(type: GraphQLNamedType, kind?: SchemaKind): TypeInfo {
  const info: TypeInfo = {
    name: type.name,
    kind: kind ?? kindOf(type),
    description: type.description ?? null,
    fields: [],
    enumValues: [],
    possibleTypes: [],
  };
  if (isObjectType(type) || isInterfaceType(type) || isInputObjectType(type)) {
    info.fields = Object.values(type.getFields()).map(fieldInfo);
  }
  if (isEnumType(type)) {
    info.enumValues = type.getValues().map((value) => ({
      name: value.name,
      description: value.description ?? null,
    }));
  }
  if (isUnionType(type)) {
    info.possibleTypes = type.getTypes().map((item) => item.name);
  }
  return info;
}

export function readCatalog(schema: GraphQLSchema): Catalog {
  const queryType = schema.getQueryType();
  const mutationType = schema.getMutationType();
  if (!queryType) throw new Error("Schema 缺少 Query");
  const types: TypeInfo[] = [];
  for (const type of Object.values(schema.getTypeMap())) {
    if (HIDDEN.has(type.name) || type.name.startsWith("__")) continue;
    if (type.name === queryType.name) continue;
    if (mutationType && type.name === mutationType.name) continue;
    if (isScalarType(type) && ["String", "Int", "Float", "Boolean", "ID"].includes(type.name))
      continue;
    types.push(typeInfo(type));
  }
  types.sort((a, b) => {
    const order: SchemaKind[] = [
      "object",
      "enum",
      "input",
      "union",
      "interface",
      "scalar",
    ];
    const diff = order.indexOf(a.kind) - order.indexOf(b.kind);
    return diff || a.name.localeCompare(b.name);
  });
  return {
    query: { ...typeInfo(queryType), kind: "query" },
    mutation: mutationType ? { ...typeInfo(mutationType), kind: "mutation" } : null,
    types,
  };
}

export function findType(catalog: Catalog, name: string) {
  if (catalog.query.name === name) return catalog.query;
  if (catalog.mutation?.name === name) return catalog.mutation;
  return catalog.types.find((type) => type.name === name);
}

export function findField(catalog: Catalog, node: SchemaNode) {
  if (node.kind !== "field") return;
  const type = findType(catalog, node.typeName);
  return type?.fields.find((field) => field.name === node.fieldName);
}

function unwrapNamed(catalog: Catalog, named: string) {
  return findType(catalog, named);
}

function indentLines(body: string, spaces: number) {
  const pad = " ".repeat(spaces);
  return body
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

function sampleInput(typeName: string) {
  if (typeName === "CreateCustomerInput")
    return '{ name: "练习同学", city: "苏州" }';
  if (typeName === "UpdateOrderInput") return "{ status: SHIPPED }";
  if (typeName === "CreateOrderInput")
    return '{ customerId: "1", items: [{ productId: "1", quantity: 1 }] }';
  if (typeName === "OrderItemInput") return '{ productId: "1", quantity: 1 }';
  return "{}";
}

function toPascal(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function starterOperationName(
  fieldName: string,
  isMutation: boolean,
  args: ArgInfo[],
) {
  const pascal = toPascal(fieldName);
  if (
    !isMutation &&
    args.some((arg) => arg.name === "id" && !arg.nullable) &&
    !/^get/i.test(fieldName)
  ) {
    return `Get${pascal}`;
  }
  return pascal;
}

function variableDefs(args: ArgInfo[]) {
  return args.map((arg) => `$${arg.name}: ${arg.type}`).join(", ");
}

function variablePasses(args: ArgInfo[]) {
  return args.map((arg) => `${arg.name}: $${arg.name}`).join(", ");
}

function sampleArgs(args: ArgInfo[]) {
  if (!args.length) return "";
  const inner = args
    .map((arg) => {
      if (arg.defaultValue != null) return `${arg.name}: ${arg.defaultValue}`;
      const named = arg.type.replace(/[![\]]/g, "");
      if (named.endsWith("Input")) return `${arg.name}: ${sampleInput(named)}`;
      if (arg.type.includes("Int") || arg.type.includes("Float"))
        return `${arg.name}: 10`;
      if (arg.type.includes("Boolean")) return `${arg.name}: true`;
      if (arg.type.includes("OrderStatus")) return `${arg.name}: PAID`;
      if (arg.name.toLowerCase().includes("id")) return `${arg.name}: "1"`;
      if (arg.name === "keyword" || arg.name === "search")
        return `${arg.name}: "林"`;
      if (arg.name === "city") return `${arg.name}: "上海"`;
      if (arg.name === "category") return `${arg.name}: "数码"`;
      return `${arg.name}: ${arg.nullable ? "null" : '""'}`;
    })
    .join(", ");
  return `(${inner})`;
}

export interface StarterExample {
  query: string;
  call: string;
}

function example(query: string, call = ""): StarterExample {
  return { query, call };
}

function selectionFor(
  catalog: Catalog,
  named: string,
  depth: number,
): string {
  const type = unwrapNamed(catalog, named);
  if (!type || type.kind === "enum" || type.kind === "scalar") return "";
  if (type.kind === "union" || type.kind === "interface") {
    const fragments = type.possibleTypes
      .map((name) => {
        const inner = selectionFor(catalog, name, depth + 1) || " {\n  __typename\n}";
        return `... on ${name} ${inner.trim()}`;
      })
      .join("\n");
    return ` {\n  __typename\n${indentLines(fragments, 2)}\n}`;
  }
  const leaves = type.fields.filter(
    (field) => field.isLeaf && field.args.length === 0,
  );
  const picked = leaves.slice(0, depth === 0 ? 5 : 4);
  if (!picked.length) {
    const first = type.fields[0];
    if (!first) return " { __typename }";
    const nested =
      depth > 1 ? "" : selectionFor(catalog, first.namedType, depth + 1);
    return ` {\n  ${first.name}${sampleArgs(first.args)}${nested}\n}`;
  }
  let extra = "";
  if (depth === 0) {
    const relation = type.fields.find(
      (field) =>
        !field.isLeaf &&
        ["orders", "items", "customer", "product"].includes(field.name),
    );
    if (relation) {
      const nested = selectionFor(catalog, relation.namedType, depth + 1).trim();
      extra = `\n  ${relation.name}${sampleArgs(relation.args)} ${indentLines(nested, 2).trimStart()}`;
    }
  }
  return ` {\n${picked.map((field) => `  ${field.name}`).join("\n")}${extra}\n}`;
}

function rootOperation(
  keyword: "query" | "mutation",
  fieldName: string,
  args: ArgInfo[],
  selection: string,
): StarterExample {
  const isMutation = keyword === "mutation";
  const body = selection
    ? `${fieldName}${args.length ? `(${variablePasses(args)})` : ""} ${indentLines(selection.trim(), 2).trimStart()}`
    : `${fieldName}${args.length ? `(${variablePasses(args)})` : ""}`;
  if (!args.length) {
    return example(`${keyword} {\n  ${body}\n}\n`);
  }
  const opName = starterOperationName(fieldName, isMutation, args);
  return example(
    `${keyword} ${opName}(${variableDefs(args)}) {\n  ${body}\n}\n`,
    `${opName}${sampleArgs(args)}\n`,
  );
}

export function starterDocument(
  catalog: Catalog,
  node: SchemaNode,
): StarterExample | null {
  if (node.kind === "type") {
    const type = findType(catalog, node.name);
    if (!type) return null;
    if (type.kind === "query") {
      const field = type.fields.find((item) => item.name === "products") ?? type.fields[0];
      if (!field) return null;
      return starterDocument(catalog, {
        kind: "field",
        typeName: type.name,
        fieldName: field.name,
      });
    }
    if (type.kind === "mutation") {
      const field = type.fields[0];
      if (!field) return null;
      return starterDocument(catalog, {
        kind: "field",
        typeName: type.name,
        fieldName: field.name,
      });
    }
    if (type.kind === "enum") {
      return example(
        `# ${type.name}：${type.enumValues.map((v) => v.name).join(" | ")}\n`,
      );
    }
    const queryRoot = catalog.query.fields.find(
      (field) => field.namedType === type.name,
    );
    if (queryRoot) {
      return starterDocument(catalog, {
        kind: "field",
        typeName: catalog.query.name,
        fieldName: queryRoot.name,
      });
    }
    const mutationRoot = catalog.mutation?.fields.find(
      (field) => field.namedType === type.name,
    );
    if (mutationRoot && catalog.mutation) {
      return starterDocument(catalog, {
        kind: "field",
        typeName: catalog.mutation.name,
        fieldName: mutationRoot.name,
      });
    }
    return null;
  }
  const type = findType(catalog, node.typeName);
  const field = type?.fields.find((item) => item.name === node.fieldName);
  if (!type || !field) return null;
  const isMutation = type.kind === "mutation" || type.name === "Mutation";
  const isQuery = type.kind === "query" || type.name === "Query";
  if (isQuery || isMutation) {
    const keyword = isMutation ? "mutation" : "query";
    const selection = field.isLeaf
      ? ""
      : selectionFor(catalog, field.namedType, 0);
    return rootOperation(keyword, field.name, field.args, selection);
  }
  const root = catalog.query.fields.find((item) => item.namedType === type.name);
  if (!root) return example(`# ${type.name}.${field.name}: ${field.type}\n`);
  const nested = field.isLeaf
    ? field.name
    : `${field.name}${sampleArgs(field.args)}${selectionFor(catalog, field.namedType, 1)}`;
  const parentLeaves = type.fields
    .filter((item) => item.isLeaf && item.args.length === 0)
    .slice(0, 3)
    .map((item) => item.name);
  const inner = `{\n${parentLeaves
    .map((name) => `    ${name}`)
    .join("\n")}\n    ${nested.split("\n").join("\n    ")}\n  }`;
  if (!root.args.length) {
    return example(
      `query {\n  ${root.name} ${inner}\n}\n`,
    );
  }
  const opName = starterOperationName(root.name, false, root.args);
  return example(
    `query ${opName}(${variableDefs(root.args)}) {\n  ${root.name}(${variablePasses(root.args)}) ${inner}\n}\n`,
    `${opName}${sampleArgs(root.args)}\n`,
  );
}
