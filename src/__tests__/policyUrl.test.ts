import { describe, it, expect } from 'vitest'
import { policyUrl } from '../policyUrl'

describe('policyUrl', () => {
  it('returns hash when namespace or policyName is missing', () => {
    expect(policyUrl(undefined, 'name', ['en-us'], 'en-us')).toBe('#')
    expect(policyUrl('ns', undefined, ['en-us'], 'en-us')).toBe('#')
    expect(policyUrl(undefined, undefined, undefined, 'en-us')).toBe('#')
  })

  it('builds URL with current language when available', () => {
    expect(
      policyUrl('Microsoft.Policies', 'TestPolicy', ['en-us', 'de-de'], 'de-de')
    ).toBe('/de-de/policy/Microsoft.Policies/TestPolicy')
  })

  it('falls back to en-us when current language not available', () => {
    expect(
      policyUrl('Microsoft.Policies', 'TestPolicy', ['en-us'], 'de-de')
    ).toBe('/en-us/policy/Microsoft.Policies/TestPolicy')
  })

  it('defaults to en-us when availableLangs is undefined', () => {
    expect(
      policyUrl('NS', 'Pol', undefined, 'fr-fr')
    ).toBe('/en-us/policy/NS/Pol')
  })

  it('uses current language when it is in the available list', () => {
    expect(
      policyUrl('NS', 'Pol', ['en-us', 'ja-jp'], 'ja-jp')
    ).toBe('/ja-jp/policy/NS/Pol')
  })
})
