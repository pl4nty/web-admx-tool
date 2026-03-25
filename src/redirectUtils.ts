export function getRedirectUrl(params: URLSearchParams, preferredLocale?: string): string {
  const policy = params.get('Policy')
  const lang = (params.get('Language') || preferredLocale || 'en-us').toLowerCase()

  if (policy?.includes('::')) {
    const sep = policy.indexOf('::')
    const category = policy.slice(0, sep)
    const name = policy.slice(sep + 2)
    if (!category.includes('..') && !name.includes('..')) {
      return `/${lang}/policy/${category}/${name}`
    }
  }
  return `/${lang}/`
}
