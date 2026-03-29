import { supportedLocales } from './locales'

const DEFAULT_LOCALE = 'en-us'

export function getRedirectUrl(params: URLSearchParams, preferredLocale?: string): string {
  const policy = params.get('Policy')
  const rawLang = (params.get('Language') || preferredLocale || DEFAULT_LOCALE).toLowerCase()
  const lang = supportedLocales.has(rawLang) ? rawLang : DEFAULT_LOCALE

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
