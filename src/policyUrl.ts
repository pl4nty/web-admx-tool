/**
 * Build a URL path for a policy, resolving the correct language.
 * Used by TreeNode, SearchResults, and BaseLayout autocomplete.
 */
export function policyUrl(
  namespace: string | undefined,
  policyName: string | undefined,
  availableLangs: string[] | undefined,
  currentLang: string
): string {
  if (!namespace || !policyName) return '#'
  const langs = Array.isArray(availableLangs) ? availableLangs : ['en-us']
  const targetLang = langs.includes(currentLang) ? currentLang : 'en-us'
  return `/${targetLang}/policy/${namespace}/${policyName}`
}
