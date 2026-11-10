import {
  GraphQLError,
  Kind,
  coerceInputValue,
  isEnumType,
  isInputObjectType,
  isInputType,
  isListType,
  isNonNullType,
  parse,
  print,
  typeFromAST,
  valueFromASTUntyped,
  type ArgumentNode,
  type FieldNode,
  type GraphQLInputType,
  type GraphQLSchema,
  type Location,
  type OperationDefinitionNode,
  type ValueNode,
} from "graphql";
import type { GqlError } from "../types";

const INVOKE = "invoke";

export const CALL_SOURCE = "call";

export interface ParsedCall {
  name: string | null;
  args: readonly ArgumentNode[];
  empty: boolean;
  source: string;
  locationOf(node?: { loc?: Location } | null): { line: number; column: number };
}

export type CallResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: GqlError[] };

function callError(
  message: string,
  location?: { line: number; column: number },
): GqlError {
  return {
    message,
    locations: location ? [location] : undefined,
    extensions: { source: CALL_SOURCE, code: "CALL" },
  };
}

function isEffectivelyEmpty(source: string) {
  return source.replace(/#[^\n]*/g, "").trim() === "";
}

function shiftLocation(
  loc: { line: number; column: number },
  source: string,
  prefixLine: number,
  prefixLength: number,
) {
  let line = loc.line - 1;
  let column = loc.column;
  if (prefixLength && line === prefixLine) column -= prefixLength;
  const lines = source.length ? source.split("\n") : [""];
  if (line < 1) {
    line = 1;
    column = 1;
  }
  if (line > lines.length) {
    line = lines.length;
    column = (lines[line - 1]?.length ?? 0) + 1;
  }
  if (column < 1) column = 1;
  return { line, column };
}

function startOf(node?: { loc?: Location } | null) {
  if (!node?.loc) return { line: 1, column: 1 };
  return {
    line: node.loc.startToken.line,
    column: node.loc.startToken.column,
  };
}

function normalizeEmptyParens(source: string) {
  return source.replace(/(\w+)\s*\(\s*\)/g, "$1").replace(/^\s*\(\s*\)\s*$/gm, "");
}

export function parseCall(source: string): CallResult<ParsedCall> {
  const fallback = (line = 1, column = 1) => ({ line, column });
  const normalized = normalizeEmptyParens(source);
  if (isEffectivelyEmpty(normalized)) {
    return {
      ok: true,
      value: {
        name: null,
        args: [],
        empty: true,
        source,
        locationOf: () => fallback(),
      },
    };
  }

  const firstToken = normalized.search(/\S/);
  const nameless = firstToken >= 0 && normalized[firstToken] === "(";
  const prefixed = nameless
    ? normalized.slice(0, firstToken) + INVOKE + normalized.slice(firstToken)
    : normalized;
  const wrapped = `{\n${prefixed}\n}`;
  const prefixLength = nameless ? INVOKE.length : 0;
  const prefixLine = nameless
    ? normalized.slice(0, firstToken).split("\n").length
    : -1;

  const locationOf = (node?: { loc?: Location } | null) =>
    shiftLocation(startOf(node), source, prefixLine, prefixLength);

  let document;
  try {
    document = parse(wrapped);
  } catch (error) {
    if (error instanceof GraphQLError) {
      const loc = error.locations?.[0];
      return {
        ok: false,
        errors: [
          callError(
            `调用语句语法错误：${error.message.replace(/^Syntax Error:?\s*/i, "")}`,
            loc
              ? shiftLocation(loc, source, prefixLine, prefixLength)
              : fallback(),
          ),
        ],
      };
    }
    return {
      ok: false,
      errors: [callError(`调用语句语法错误：${String(error)}`)],
    };
  }

  const definition = document.definitions[0];
  if (definition?.kind !== Kind.OPERATION_DEFINITION) {
    return {
      ok: false,
      errors: [callError("调用语句无法解析成一次操作调用。", fallback())],
    };
  }

  const selections = definition.selectionSet.selections;
  if (!selections.length) {
    return {
      ok: true,
      value: {
        name: null,
        args: [],
        empty: true,
        source,
        locationOf,
      },
    };
  }
  if (selections.length > 1) {
    return {
      ok: false,
      errors: [
        callError(
          "调用语句只能写一个操作调用，例如 GetCustomer(id: \"1\")。",
          locationOf(selections[1]),
        ),
      ],
    };
  }

  const field = selections[0];
  if (field.kind !== Kind.FIELD) {
    return {
      ok: false,
      errors: [callError("调用语句必须是操作名加参数。", locationOf(field))],
    };
  }
  if (field.alias) {
    return {
      ok: false,
      errors: [
        callError("调用语句不要写别名，直接写操作名和参数。", locationOf(field.alias)),
      ],
    };
  }
  if (field.selectionSet) {
    return {
      ok: false,
      errors: [
        callError(
          "调用语句只负责传入参数，选择集请写在上方的操作定义里。",
          locationOf(field.selectionSet),
        ),
      ],
    };
  }
  if (field.directives?.length) {
    return {
      ok: false,
      errors: [
        callError("调用语句里不要写指令。", locationOf(field.directives[0])),
      ],
    };
  }

  return {
    ok: true,
    value: {
      name: nameless ? null : field.name.value,
      args: field.arguments ?? [],
      empty: false,
      source,
      locationOf,
    },
  };
}

function singleRootField(operation: OperationDefinitionNode): FieldNode | null {
  const fields = operation.selectionSet.selections.filter(
    (node): node is FieldNode =>
      node.kind === Kind.FIELD && !node.name.value.startsWith("__"),
  );
  return fields.length === 1 ? fields[0] : null;
}

export function allowedCallNames(operation: OperationDefinitionNode) {
  const names = new Set<string>();
  if (operation.name?.value) names.add(operation.name.value);
  const field = singleRootField(operation);
  if (field) names.add(field.name.value);
  return names;
}

export function ambiguousOperationsError(
  operations: OperationDefinitionNode[],
): GqlError {
  const names = operations.map((node) => node.name?.value).filter(Boolean);
  const unnamed = operations.length - names.length;
  return {
    message: unnamed
      ? `文档包含 ${operations.length} 个操作，且有未命名操作。请只运行一个操作，或为每个操作命名后在下方调用其中一个。`
      : `文档包含多个操作（${names.join("、")}）。请在下方调用其中一个，例如 ${names[0]}()，或只保留一个操作。`,
  };
}

function checkValue(
  node: ValueNode,
  type: GraphQLInputType,
  report: (message: string, node: { loc?: Location }) => void,
): unknown {
  if (node.kind === Kind.VARIABLE) {
    report("调用语句里请写字面量，不要使用 $变量。", node);
    return;
  }

  if (isNonNullType(type)) {
    if (node.kind === Kind.NULL) {
      report(`Expected non-nullable type "${type}" not to be null.`, node);
      return;
    }
    return checkValue(node, type.ofType, report);
  }

  if (node.kind === Kind.NULL) return null;

  if (isListType(type)) {
    const items = node.kind === Kind.LIST ? node.values : [node];
    return items.map((item) => checkValue(item, type.ofType, report));
  }

  if (isEnumType(type)) {
    if (node.kind !== Kind.ENUM) {
      report(
        `got invalid value ${print(node)}; Expected type "${type.name}". Enum values are unquoted, for example ${type.getValues()[0]?.name ?? type.name}.`,
        node,
      );
      return;
    }
    if (!type.getValue(node.value)) {
      report(`Value "${node.value}" does not exist in "${type.name}" enum.`, node);
      return;
    }
    return node.value;
  }

  if (isInputObjectType(type)) {
    if (node.kind !== Kind.OBJECT) {
      report(
        `got invalid value ${print(node)}; Expected type "${type.name}" to be an object.`,
        node,
      );
      return;
    }
    const fields = type.getFields();
    const given = new Map(node.fields.map((field) => [field.name.value, field]));
    const result: Record<string, unknown> = {};
    for (const field of Object.values(fields)) {
      const entry = given.get(field.name);
      if (!entry) {
        if (isNonNullType(field.type) && field.defaultValue === undefined) {
          report(
            `Field "${field.name}" of required type "${field.type}" was not provided.`,
            node,
          );
        }
        continue;
      }
      const value = checkValue(entry.value, field.type, report);
      if (value !== undefined) result[field.name] = value;
    }
    for (const [name, fieldNode] of given) {
      if (!fields[name]) {
        report(
          `Field "${name}" is not defined by type "${type.name}".`,
          fieldNode,
        );
      }
    }
    return result;
  }

  const raw = valueFromASTUntyped(node);
  let failed = "";
  const coerced = coerceInputValue(raw, type, (_path, _invalid, error) => {
    failed = error.message;
  });
  if (failed) {
    report(failed, node);
    return;
  }
  return coerced;
}

export function bindCallVariables(options: {
  schema: GraphQLSchema;
  operation: OperationDefinitionNode;
  call: ParsedCall;
}): CallResult<Record<string, unknown>> {
  const { schema, operation, call } = options;
  const errors: GqlError[] = [];
  const definitions = operation.variableDefinitions ?? [];
  const defined = new Map(
    definitions.map((definition) => [definition.variable.name.value, definition]),
  );
  const provided = new Map<string, ArgumentNode>();
  const origin = call.locationOf();

  for (const arg of call.args) {
    const name = arg.name.value;
    if (provided.has(name)) {
      errors.push(callError(`调用里参数 "${name}" 重复了。`, call.locationOf(arg.name)));
      continue;
    }
    provided.set(name, arg);
    if (!defined.has(name)) {
      const known = [...defined.keys()].map((item) => `$${item}`).join("、");
      errors.push(
        callError(
          defined.size
            ? `调用里有未知参数 "${name}"。该操作定义的变量是 ${known}。`
            : `该操作没有定义变量，请把参数写在上方查询里，或留空调用区。`,
          call.locationOf(arg.name),
        ),
      );
    }
  }

  const variableValues: Record<string, unknown> = {};
  for (const [name, definition] of defined) {
    const arg = provided.get(name);
    const type = typeFromAST(schema, definition.type);
    if (!type || !isInputType(type)) {
      errors.push(
        callError(
          `变量 $${name} 的类型无法识别。`,
          call.locationOf(definition.type),
        ),
      );
      continue;
    }
    const required =
      isNonNullType(type) && definition.defaultValue === undefined;
    if (!arg) {
      if (required) {
        const exampleName =
          operation.name?.value ||
          singleRootField(operation)?.name.value ||
          "Operation";
        errors.push(
          callError(
            `Variable "$${name}" of required type "${type}" was not provided. 请在下方调用，例如 ${exampleName}(${name}: …)。`,
            origin,
          ),
        );
      }
      continue;
    }
    const value = checkValue(arg.value, type, (message, node) => {
      const detail = message.startsWith("got invalid")
        ? `Variable "$${name}" ${message}`
        : message.startsWith("Variable ")
          ? message
          : `Variable "$${name}" ${message}`;
      errors.push(callError(detail, call.locationOf(node)));
    });
    if (value !== undefined) variableValues[name] = value;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: variableValues };
}

export function resolveExecutionCall(options: {
  schema: GraphQLSchema;
  operations: OperationDefinitionNode[];
  callSource: string;
  operationName?: string | null;
}): CallResult<{
  operation: OperationDefinitionNode;
  variableValues: Record<string, unknown>;
}> {
  const parsed = parseCall(options.callSource);
  if (!parsed.ok) return parsed;

  const { operations, operationName } = options;
  const call = parsed.value;
  let selected: OperationDefinitionNode | undefined;

  if (operationName) {
    selected = operations.find((node) => node.name?.value === operationName);
    if (!selected) {
      return {
        ok: false,
        errors: [
          callError(`找不到名为 ${operationName} 的操作。`),
        ],
      };
    }
  } else if (call.name) {
    selected = operations.find((node) => node.name?.value === call.name);
    if (!selected) {
      const matches = operations.filter(
        (node) => singleRootField(node)?.name.value === call.name,
      );
      if (matches.length === 1) selected = matches[0];
    }
    if (!selected) {
      const names = operations
        .map((node) => node.name?.value)
        .filter(Boolean)
        .join("、");
      return {
        ok: false,
        errors: [
          callError(
            names
              ? `调用 ${call.name} 对不上文档里的 operation。可用的操作：${names}。`
              : `调用 ${call.name} 对不上文档里的 operation。`,
            call.locationOf(),
          ),
        ],
      };
    }
    if (operations.length > 1 && !selected.name) {
      return {
        ok: false,
        errors: [
          callError(
            "文档包含多个操作时，请为每个操作命名，并用调用名指定要运行的那一个。",
            call.locationOf(),
          ),
        ],
      };
    }
  } else if (operations.length === 1) {
    selected = operations[0];
  } else {
    return { ok: false, errors: [ambiguousOperationsError(operations)] };
  }

  if (call.name && !allowedCallNames(selected).has(call.name)) {
    const expected = selected.name?.value
      ? `当前操作是 ${selected.name.value}`
      : "当前操作没有名字，请用根字段名调用，或给操作命名";
    return {
      ok: false,
      errors: [
        callError(
          `调用 ${call.name} 与要执行的操作不匹配。${expected}。`,
          call.locationOf(),
        ),
      ],
    };
  }

  const bound = bindCallVariables({
    schema: options.schema,
    operation: selected,
    call,
  });
  if (!bound.ok) return bound;
  return {
    ok: true,
    value: { operation: selected, variableValues: bound.value },
  };
}
