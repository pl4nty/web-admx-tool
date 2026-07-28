import { describe, it, expect } from 'vitest'
import { formatPolicyValue, registryPath, describeListValueNames } from './policyFormat'
import { parseAdmx } from './parser'

describe('formatPolicyValue', () => {
  it('formats decimal, string and delete values', () => {
    expect(formatPolicyValue({ type: 'decimal', value: 1 })).toBe('1')
    expect(formatPolicyValue({ type: 'string', value: 'abc' })).toBe('abc')
    expect(formatPolicyValue({ type: 'delete' })).toBe('Delete value')
  })

  it('renders an empty string value as empty, not as unset', () => {
    expect(formatPolicyValue({ type: 'string', value: '' })).toBe('')
  })

  it('reports missing values as unset', () => {
    expect(formatPolicyValue(null)).toBe('Not set')
    expect(formatPolicyValue(undefined)).toBe('Not set')
  })
})

describe('registryPath', () => {
  it('joins key and value name', () => {
    expect(registryPath('software\\policies\\x', 'default')).toBe('software\\policies\\x\\default')
  })

  it('tolerates a trailing separator on the key', () => {
    expect(registryPath('software\\policies\\x\\', 'default')).toBe('software\\policies\\x\\default')
  })

  it('falls back when either side is missing', () => {
    expect(registryPath('software\\policies\\x', '')).toBe('software\\policies\\x')
    expect(registryPath('', 'default')).toBe('default')
  })
})

describe('describeListValueNames', () => {
  it('describes explicit value names', () => {
    expect(describeListValueNames({ explicitValue: true })).toBe('Value names are supplied per entry')
  })

  it('describes generated value names with and without a prefix', () => {
    expect(describeListValueNames({ valuePrefix: 'Item' })).toBe('Value names are generated: Item1, Item2, ...')
    expect(describeListValueNames({})).toBe('Value names are generated: 1, 2, ...')
  })
})

const ADMX = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions revision="1.0" schemaVersion="1.0">
  <policyNamespaces>
    <target prefix="test" namespace="Test.Policies" />
  </policyNamespaces>
  <categories><category name="Cat" displayName="$(string.Cat)" /></categories>
  <policies>
    <policy name="P" class="User" displayName="$(string.P)" explainText="$(string.P)" key="software\\policies\\parent">
      <parentCategory ref="Cat" />
      <enabledList>
        <item key="software\\policies\\parent" valueName="policyon"><value><decimal value="1" /></value></item>
      </enabledList>
      <disabledList>
        <item key="software\\policies\\parent" valueName="policyon"><value><delete /></value></item>
      </disabledList>
      <elements>
        <text id="t0" key="software\\policies\\child" valueName="default" required="true" expandable="true" />
      </elements>
    </policy>
  </policies>
</policyDefinitions>`

describe('parseAdmx registry locations', () => {
  it('keeps an element key that differs from the policy key', async () => {
    const { policies } = await parseAdmx(ADMX)
    const elem = policies[0].elements[0]
    expect(policies[0].key).toBe('software\\policies\\parent')
    expect(elem.key).toBe('software\\policies\\child')
    expect(elem.valueName).toBe('default')
    expect(registryPath(elem.key, elem.valueName)).toBe('software\\policies\\child\\default')
  })

  it('parses self-closing <delete /> instead of dropping it', async () => {
    const { policies } = await parseAdmx(ADMX)
    expect(policies[0].enabledList).toEqual([
      { key: 'software\\policies\\parent', valueName: 'policyon', value: { type: 'decimal', value: 1 } },
    ])
    expect(policies[0].disabledList).toEqual([
      { key: 'software\\policies\\parent', valueName: 'policyon', value: { type: 'delete' } },
    ])
  })
})
