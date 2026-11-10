import {
  graphql,
  GraphQLError,
  Kind,
  parse,
  type DocumentNode,
  type GraphQLSchema,
  type OperationDefinitionNode,
} from "graphql";
import type { Execution, GqlError } from "../types";
import type { PracticeStore } from "./store";
import { ambiguousOperationsError, resolveExecutionCall } from "./call";

function formatError(error: GraphQLError): GqlError {
  const json = error.toJSON();
  return {
    message: json.message,
    locations: json.locations?.map((location) => ({
      line: location.line,
      column: location.column,
    })),
    path: json.path as (string | number)[] | undefined,
    extensions: json.extensions as Record<string, unknown> | undefined,
  };
}

function toGqlError(error: unknown): GqlError {
  if (error instanceof GraphQLError) return formatError(error);
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

function operationsOf(document: DocumentNode): OperationDefinitionNode[] {
  return document.definitions.filter(
    (node): node is OperationDefinitionNode =>
      node.kind === Kind.OPERATION_DEFINITION,
  );
}

function payloadJson(data: unknown, errors?: GqlError[]) {
  const payload: Record<string, unknown> = { data };
  if (errors?.length) payload.errors = errors;
  return JSON.stringify(payload, null, 2);
}

export function listOperationNames(source: string) {
  try {
    return operationsOf(parse(source)).map((node) => ({
      name: node.name?.value,
      type: node.operation,
    }));
  } catch {
    return [];
  }
}

export async function executeGql(options: {
  schema: GraphQLSchema;
  store: PracticeStore;
  source: string;
  call?: string | null;
  variableValues?: Record<string, unknown> | null;
  operationName?: string | null;
}): Promise<Execution> {
  const source = options.source.trim();
  if (!source) {
    const errors = [{ message: "没有可执行的 GraphQL 文档。" }];
    return {
      data: null,
      errors,
      json: payloadJson(null, errors),
      operation: "empty",
    };
  }

  let document: DocumentNode;
  try {
    document = parse(source);
  } catch (error) {
    const errors = [toGqlError(error)];
    return {
      data: null,
      errors,
      json: payloadJson(null, errors),
      operation: "parse",
    };
  }

  const operations = operationsOf(document);
  if (!operations.length) {
    const errors = [
      {
        message: "文档里没有可执行的 operation（query / mutation）。",
      },
    ];
    return {
      data: null,
      errors,
      json: payloadJson(null, errors),
      operation: "none",
    };
  }

  const useCall = options.call !== undefined && options.call !== null;
  let selected: OperationDefinitionNode;
  let variableValues = options.variableValues ?? undefined;

  if (useCall) {
    const resolved = resolveExecutionCall({
      schema: options.schema,
      operations,
      callSource: options.call || "",
      operationName: options.operationName,
    });
    if (!resolved.ok) {
      return {
        data: null,
        errors: resolved.errors,
        json: payloadJson(null, resolved.errors),
        operation: "call",
      };
    }
    selected = resolved.value.operation;
    variableValues = resolved.value.variableValues;
  } else {
    if (operations.length > 1 && !options.operationName) {
      const errors = [ambiguousOperationsError(operations)];
      return {
        data: null,
        errors,
        json: payloadJson(null, errors),
        operation: "ambiguous",
      };
    }
    selected =
      operations.find((node) => node.name?.value === options.operationName) ??
      operations[0];
  }

  try {
    const result = await graphql({
      schema: options.schema,
      source,
      contextValue: { store: options.store },
      variableValues,
      operationName: options.operationName ?? selected.name?.value,
    });
    const errors = result.errors?.map(formatError);
    return {
      data: result.data ?? null,
      errors,
      json: payloadJson(result.data ?? null, errors),
      operation: selected.operation,
    };
  } catch (error) {
    const errors = [toGqlError(error)];
    return {
      data: null,
      errors,
      json: payloadJson(null, errors),
      operation: selected.operation,
    };
  }
}

export function locationToOffset(
  source: string,
  line: number,
  column: number,
) {
  let offset = 0;
  let current = 1;
  while (current < line) {
    const next = source.indexOf("\n", offset);
    if (next < 0) return source.length;
    offset = next + 1;
    current += 1;
  }
  return Math.min(source.length, offset + Math.max(0, column - 1));
}
