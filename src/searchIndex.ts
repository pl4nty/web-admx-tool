import MiniSearch from 'minisearch'
import { MINISEARCH_OPTS } from './searchConfig'

// Shared per page so the header autocomplete and search results page parse the (large) index once
const cache = new Map<string, Promise<MiniSearch>>()

export function loadSearchIndex(lang: string): Promise<MiniSearch> {
  let promise = cache.get(lang)
  if (!promise) {
    promise = fetch(`/data/search-${lang}.json`).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }).then(data => MiniSearch.loadJS(data, MINISEARCH_OPTS))
    promise.catch(() => cache.delete(lang))
    cache.set(lang, promise)
  }
  return promise
}
