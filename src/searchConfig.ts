export const SEARCH_FIELDS = ['displayName', 'explainText', 'name', 'key', 'cspUri']
export const SEARCH_STORE_FIELDS = ['fileSlug', 'namespace', 'name', 'displayName', 'class', 'category', 'availableLangs']

export const MINISEARCH_OPTS = {
  fields: SEARCH_FIELDS,
  storeFields: SEARCH_STORE_FIELDS,
  searchOptions: { boost: { displayName: 3, name: 2 }, fuzzy: 0.2, prefix: true },
}
