// The one response shape every Route Handler and Server Action returns.
// See docs/architecture/naming-standards.md — no endpoint invents its own shape.
export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export function ok<T>(data: T): ApiResult<T> {
  return { success: true, data }
}

export function fail(error: string): ApiResult<never> {
  return { success: false, error }
}
