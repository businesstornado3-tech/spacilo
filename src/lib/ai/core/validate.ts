/**
 * AI response validation.
 *
 * Providers propose; the validator decides whether the shape is usable. A
 * failed validation becomes a structured error, never a runtime crash in a
 * component.
 */
import { AiError } from "./errors";

export interface AiSchemaIssue {
  path: string;
  message: string;
}

export type AiValidation<T> = { ok: true; value: T } | { ok: false; issues: AiSchemaIssue[] };

export interface AiSchema<T> {
  readonly name: string;
  readonly version: string;
  validate(value: unknown, path?: string): AiValidation<T>;
}

function fail(path: string, message: string): AiValidation<never> {
  return { ok: false, issues: [{ path: path || "$", message }] };
}

export function aiString(name = "string"): AiSchema<string> {
  return {
    name,
    version: "1",
    validate: (value, path = "$") =>
      typeof value === "string" ? { ok: true, value } : fail(path, "expected a string"),
  };
}

export function aiNumber(name = "number", range?: { min?: number; max?: number }): AiSchema<number> {
  return {
    name,
    version: "1",
    validate: (value, path = "$") => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return fail(path, "expected a finite number");
      }
      if (range?.min !== undefined && value < range.min) return fail(path, `below ${range.min}`);
      if (range?.max !== undefined && value > range.max) return fail(path, `above ${range.max}`);
      return { ok: true, value };
    },
  };
}

export function aiBoolean(name = "boolean"): AiSchema<boolean> {
  return {
    name,
    version: "1",
    validate: (value, path = "$") =>
      typeof value === "boolean" ? { ok: true, value } : fail(path, "expected a boolean"),
  };
}

export function aiArray<T>(item: AiSchema<T>, name = `${item.name}[]`): AiSchema<T[]> {
  return {
    name,
    version: item.version,
    validate: (value, path = "$") => {
      if (!Array.isArray(value)) return fail(path, "expected an array");
      const out: T[] = [];
      const issues: AiSchemaIssue[] = [];
      value.forEach((entry, index) => {
        const check = item.validate(entry, `${path}[${index}]`);
        if (check.ok) out.push(check.value);
        else issues.push(...check.issues);
      });
      return issues.length ? { ok: false, issues } : { ok: true, value: out };
    },
  };
}

export function aiObject<T extends Record<string, unknown>>(
  shape: { [K in keyof T]: AiSchema<T[K]> },
  name = "object",
): AiSchema<T> {
  return {
    name,
    version: "1",
    validate: (value, path = "$") => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return fail(path, "expected an object");
      }
      const source = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const issues: AiSchemaIssue[] = [];
      for (const key of Object.keys(shape) as Array<keyof T & string>) {
        const check = shape[key].validate(source[key], `${path}.${key}`);
        if (check.ok) out[key] = check.value;
        else issues.push(...check.issues);
      }
      return issues.length ? { ok: false, issues } : { ok: true, value: out as T };
    },
  };
}

/** Accepts anything. Used by local engines that already return typed objects. */
export function aiPassthrough<T>(name = "passthrough"): AiSchema<T> {
  return { name, version: "1", validate: (value) => ({ ok: true, value: value as T }) };
}

/** Validates or throws the standard invalid-response error. */
export function assertValid<T>(schema: AiSchema<T>, value: unknown): T {
  const check = schema.validate(value);
  if (check.ok) return check.value;
  const detail = check.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  throw new AiError("invalid_response", `${schema.name}@${schema.version} — ${detail}`);
}
