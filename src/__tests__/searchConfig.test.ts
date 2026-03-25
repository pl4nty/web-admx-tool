import { describe, it, expect } from 'vitest'
import { MINISEARCH_OPTS, SEARCH_FIELDS, SEARCH_STORE_FIELDS } from '../searchConfig'

describe('searchConfig', () => {
  it('has correct search fields', () => {
    expect(SEARCH_FIELDS).toContain('displayName')
    expect(SEARCH_FIELDS).toContain('name')
    expect(SEARCH_FIELDS).toContain('explainText')
    expect(SEARCH_FIELDS).toContain('key')
    expect(SEARCH_FIELDS).toContain('cspUri')
  })

  it('has correct store fields', () => {
    expect(SEARCH_STORE_FIELDS).toContain('fileSlug')
    expect(SEARCH_STORE_FIELDS).toContain('namespace')
    expect(SEARCH_STORE_FIELDS).toContain('name')
    expect(SEARCH_STORE_FIELDS).toContain('displayName')
    expect(SEARCH_STORE_FIELDS).toContain('availableLangs')
  })

  it('has valid MiniSearch options', () => {
    expect(MINISEARCH_OPTS.fields).toEqual(SEARCH_FIELDS)
    expect(MINISEARCH_OPTS.storeFields).toEqual(SEARCH_STORE_FIELDS)
    expect(MINISEARCH_OPTS.searchOptions).toBeDefined()
    expect(MINISEARCH_OPTS.searchOptions.fuzzy).toBe(0.2)
    expect(MINISEARCH_OPTS.searchOptions.prefix).toBe(true)
  })
})
