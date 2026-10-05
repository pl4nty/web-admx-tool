import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { generateExtensionAdmx, parseLenientJson, readExtensionPackage, readTemplateStamp, sameVersion, unpackCrx } from './extensionAdmx'
import { parseAdmx, parseAdml } from './parser'

const ID = 'abcdefghijklmnopabcdefghijklmnop'

describe('parseLenientJson', () => {
  it('accepts comments and trailing commas but keeps them inside strings', () => {
    expect(parseLenientJson('{\n// c\n"a": "http://x/*y*/", /* b */ "b": [1,],\n}')).toEqual({ a: 'http://x/*y*/', b: [1] })
  })
})

describe('unpackCrx', () => {
  it('reads a CRX3 package and its managed schema', () => {
    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify({ name: '__MSG_n__', version: '1', default_locale: 'en', storage: { managed_schema: 'schema.json' } })),
      'schema.json': strToU8('{"type":"object","properties":{}}'),
      '_locales/en/messages.json': strToU8('{"n":{"message":"Name"}}'),
    })
    const header = new Uint8Array(4)
    const crx = new Uint8Array(12 + header.length + zip.length)
    crx.set(strToU8('Cr24'))
    new DataView(crx.buffer).setUint32(4, 3, true)
    new DataView(crx.buffer).setUint32(8, header.length, true)
    crx.set(zip, 12 + header.length)
    const { manifest, schema, messages } = readExtensionPackage(unpackCrx(crx))
    expect(manifest.version).toBe('1')
    expect(schema.type).toBe('object')
    expect(messages?.n.message).toBe('Name')
  })
})

describe('generateExtensionAdmx', () => {
  const schema = {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', title: '__MSG_t__', description: 'Turns it on' },
      count: { type: 'integer', minimum: 1, maximum: 10 },
      mode: { type: 'string', enum: ['a', 'b'], default: 'a' },
      ratio: { type: 'number' },
      sites: { type: 'array', items: { type: 'string' } },
      rules: { type: 'array', items: { type: 'object', properties: { domain: { type: 'string' } } } },
      extra: { type: 'object', additionalProperties: { type: 'string' } },
      nested: { type: 'object', properties: { '0': { $ref: 'Shared' }, shared: { id: 'Shared', type: 'object', properties: { url: { type: 'string' } } } } },
    },
  }
  const { admx, adml } = generateExtensionAdmx({ name: 'Test & Co', id: ID, version: '1.2', schema, messages: { t: { message: 'Enabled' } } })

  it('targets the browser extension policy key', async () => {
    const parsed = await parseAdmx(admx)
    expect(parsed.target.namespace).toBe(`BrowserExtension.${ID}`)
    expect(admx).toContain(`key="Software\\Policies\\Microsoft\\Edge\\3rdparty\\extensions\\${ID}\\policy"`)
    expect(parsed.categories[0]).toMatchObject({ name: 'extension', parentRef: null })
  })

  it('maps schema types to ADMX elements', async () => {
    const parsed = await parseAdmx(admx)
    const byName = Object.fromEntries(parsed.policies.map((p: any) => [p.name, p]))
    expect(byName.extension_enabled.valueName).toBe('enabled')
    expect(byName.extension_count.elements[0]).toMatchObject({ type: 'decimal', minValue: 1, maxValue: 10 })
    expect(byName.extension_mode.elements[0].type).toBe('enum')
    expect(byName.extension_ratio.elements[0].type).toBe('text')
    expect(byName.extension_sites.elements[0]).toMatchObject({ type: 'list', key: expect.stringMatching(/\\policy\\sites$/) })
    expect(byName.extension_extra.elements[0].type).toBe('text')
    expect(byName.extension_nested_0_url.key).toMatch(/\\policy\\nested\\0$/)
  })

  it('resolves localized strings and escapes XML', async () => {
    const { strings, presentations } = await parseAdml(adml)
    expect(adml).toContain('>Enabled</string>')
    expect(adml).toContain('<displayName>Test &amp; Co Browser Extension</displayName>')
    expect(adml).toContain('Default: &quot;a&quot;')
    expect(strings.extension).toBe('Test & Co Browser Extension')
    expect(presentations.extension_rules[0].label).toMatch(/JSON/)
  })
})

describe('template stamp', () => {
  it('round-trips version and fingerprint through the header comment', () => {
    const { admx } = generateExtensionAdmx({ name: 'X', id: ID, version: '1.2.3', fingerprint: 'abc123', schema: { type: 'object', properties: {} } })
    expect(readTemplateStamp(admx)).toEqual({ version: '1.2.3', fingerprint: 'abc123' })
  })

  it('compares versions ignoring trailing zeros', () => {
    expect(sameVersion('2.1.1067', '2.1.1067.0')).toBe(true)
    expect(sameVersion('1.0', '1')).toBe(true)
    expect(sameVersion('1.10', '1.1')).toBe(false)
  })
})
