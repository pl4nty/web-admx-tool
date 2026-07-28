export interface PolicyValueLike { type?: string; value?: string | number }

/** Renders an ADMX <value> node (decimal/string/delete) for display. */
export function formatPolicyValue(val: PolicyValueLike | null | undefined): string {
  if (!val) return 'Not set'
  if (val.type === 'decimal') return String(val.value)
  if (val.type === 'string') return String(val.value ?? '')
  if (val.type === 'delete') return 'Delete value'
  return String(val)
}

/** Joins a registry key and value name for display, tolerating either being absent. */
export function registryPath(key: string | undefined | null, valueName: string | undefined | null): string {
  const k = (key || '').replace(/\\+$/, '')
  if (!valueName) return k
  return k ? `${k}\\${valueName}` : valueName
}

/**
 * Describes where a <list> element writes its values, since list elements carry no
 * single valueName: either the user supplies each name (explicitValue) or names are
 * generated as <valuePrefix>1, <valuePrefix>2, ... under the key.
 */
export function describeListValueNames(elem: { explicitValue?: boolean; valuePrefix?: string }): string {
  if (elem.explicitValue) return 'Value names are supplied per entry'
  const prefix = elem.valuePrefix || ''
  return `Value names are generated: ${prefix}1, ${prefix}2, ...`
}
