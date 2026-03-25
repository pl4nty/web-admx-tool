import { describe, it, expect } from 'vitest'
import { getRedirectUrl } from './redirectUtils'

describe('getRedirectUrl', () => {
  it('redirects to default locale when no params given', () => {
    expect(getRedirectUrl(new URLSearchParams())).toBe('/en-us/')
  })

  it('uses Language param for locale', () => {
    expect(getRedirectUrl(new URLSearchParams('Language=fr-fr'))).toBe('/fr-fr/')
  })

  it('lowercases the language', () => {
    expect(getRedirectUrl(new URLSearchParams('Language=EN-US'))).toBe('/en-us/')
  })

  it('uses preferredLocale when no Language param', () => {
    expect(getRedirectUrl(new URLSearchParams(), 'de-de')).toBe('/de-de/')
  })

  it('Language param takes precedence over preferredLocale', () => {
    expect(getRedirectUrl(new URLSearchParams('Language=fr-fr'), 'de-de')).toBe('/fr-fr/')
  })

  it('redirects to policy page when Policy contains ::', () => {
    expect(getRedirectUrl(new URLSearchParams('Policy=Cat::PolicyName'))).toBe(
      '/en-us/policy/Cat/PolicyName'
    )
  })

  it('uses Language when redirecting to policy', () => {
    expect(getRedirectUrl(new URLSearchParams('Policy=Cat::PolicyName&Language=de-de'))).toBe(
      '/de-de/policy/Cat/PolicyName'
    )
  })

  it('only splits on the first :: separator', () => {
    expect(getRedirectUrl(new URLSearchParams('Policy=Cat::Sub::Policy'))).toBe(
      '/en-us/policy/Cat/Sub::Policy'
    )
  })

  it('falls back to locale root when policy contains path traversal', () => {
    expect(getRedirectUrl(new URLSearchParams('Policy=Cat::../../etc'))).toBe('/en-us/')
    expect(getRedirectUrl(new URLSearchParams('Policy=../Cat::Policy'))).toBe('/en-us/')
  })
})
