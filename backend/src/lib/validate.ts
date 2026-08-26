// Minimal dependency-free schema validation.
// Deliberately tiny: every public endpoint validates its input, and doing so
// without pulling in a runtime validation library keeps the install surface
// small. Swap for zod later without touching call sites much.
import { ApiError } from "./http";

type Rule<T> = (value: unknown, field: string) => T;

export const v = {
  string(opts: { min?: number; max?: number; pattern?: RegExp; lower?: boolean; trim?: boolean } = {}): Rule<string> {
    return (value, field) => {
      if (typeof value !== "string") throw ApiError.badRequest(`${field} must be a string`);
      let s = opts.trim === false ? value : value.trim();
      if (opts.lower) s = s.toLowerCase();
      if (opts.min != null && s.length < opts.min) throw ApiError.badRequest(`${field} must be at least ${opts.min} characters`);
      if (opts.max != null && s.length > opts.max) throw ApiError.badRequest(`${field} must be at most ${opts.max} characters`);
      if (opts.pattern && !opts.pattern.test(s)) throw ApiError.badRequest(`${field} has an invalid format`);
      return s;
    };
  },
  number(opts: { min?: number; max?: number; int?: boolean } = {}): Rule<number> {
    return (value, field) => {
      const n = typeof value === "string" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isFinite(n)) throw ApiError.badRequest(`${field} must be a number`);
      if (opts.int && !Number.isInteger(n)) throw ApiError.badRequest(`${field} must be a whole number`);
      if (opts.min != null && n < opts.min) throw ApiError.badRequest(`${field} must be >= ${opts.min}`);
      if (opts.max != null && n > opts.max) throw ApiError.badRequest(`${field} must be <= ${opts.max}`);
      return n;
    };
  },
  boolean(): Rule<boolean> {
    return (value, field) => {
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      throw ApiError.badRequest(`${field} must be a boolean`);
    };
  },
  enumOf<T extends string>(values: readonly T[]): Rule<T> {
    return (value, field) => {
      const s = String(value ?? "").toUpperCase();
      const hit = values.find((v2) => v2.toUpperCase() === s);
      if (!hit) throw ApiError.badRequest(`${field} must be one of: ${values.join(", ")}`);
      return hit;
    };
  },
  date(): Rule<Date> {
    return (value, field) => {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`${field} must be a valid date`);
      return d;
    };
  },
  stringArray(opts: { max?: number } = {}): Rule<string[]> {
    return (value, field) => {
      const arr = Array.isArray(value) ? value : typeof value === "string" ? [value] : null;
      if (!arr) throw ApiError.badRequest(`${field} must be an array`);
      if (opts.max != null && arr.length > opts.max) throw ApiError.badRequest(`${field} accepts at most ${opts.max} entries`);
      return arr.map((x) => String(x));
    };
  },
  optional<T>(rule: Rule<T>): Rule<T | undefined> {
    return (value, field) => (value === undefined || value === null || value === "" ? undefined : rule(value, field));
  },
  withDefault<T>(rule: Rule<T>, fallback: T): Rule<T> {
    return (value, field) => (value === undefined || value === null || value === "" ? fallback : rule(value, field));
  },
};

export type Schema<T> = { [K in keyof T]: Rule<T[K]> };

/** Validates `input` against `schema`, throwing a 400 on the first failure. */
export function parse<T>(schema: Schema<T>, input: Record<string, unknown>): T {
  const out = {} as T;
  for (const key of Object.keys(schema) as (keyof T)[]) {
    out[key] = schema[key](input?.[key as string], String(key));
  }
  return out;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^\+?[0-9]{10,15}$/;
export const SYMBOL_RE = /^[A-Za-z0-9.&^-]{1,24}$/;

/** Strips characters that have no business being in a stored free-text field. */
export function sanitizeText(input: string, max = 4000): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max);
}
