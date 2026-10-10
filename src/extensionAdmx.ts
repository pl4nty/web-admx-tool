/**
 * Generates ADMX/ADML templates from a browser extension's managed storage
 * schema (manifest `storage.managed_schema`).
 *
 * Port of Chromium's components/policy/tools/generate_extension_admx.py, with:
 * - Edge registry keys (Software\Policies\Microsoft\Edge\3rdparty\extensions)
 * - `$ref`s resolved regardless of where the referenced `id` is declared
 * - enums rendered as dropdowns, integer min/max carried into decimal elements
 * - property-less objects and non-string list items accepted as JSON strings,
 *   which Chromium's RegistryDict parses against the schema
 * - `__MSG_*__` placeholders resolved from the extension's default locale
 * - comments and trailing commas tolerated in schema JSON, like Chromium's parser
 */
import { unzipSync, strFromU8 } from 'fflate'

export interface ExtensionTemplateInput {
  /** Display name, e.g. "uBlock Origin" */
  name: string
  /** 32-character extension ID, as installed in Edge */
  id: string
  version?: string
  /** Opaque value recorded in the header comment, used to detect stale templates */
  fingerprint?: string
  schema: any
  /** Default-locale messages.json contents, used to resolve __MSG_x__ placeholders */
  messages?: Record<string, { message: string }>
}

const REGISTRY_ROOT = 'Software\\Policies\\Microsoft\\Edge\\3rdparty\\extensions'

/** Shared "Browser Extensions" parent category, defined by generateExtensionCategoryAdmx */
const PARENT = { namespace: 'BrowserExtension', prefix: 'browserextension', category: 'BrowserExtensions' }

/** Chromium reads integer policies as signed 32-bit */
const DECIMAL_MAX = 2147483647

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const toId = (s: string) => s.replace(/[^0-9a-zA-Z]+/g, '_')

/** JSON.parse that tolerates comments and trailing commas, as Chromium's JSON reader does. */
export function parseLenientJson(text: string): any {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      const start = i
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++
      out += text.slice(start, i + 1)
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1
      if (i === 0) break
    } else out += c
  }
  return JSON.parse(out.replace(/^﻿/, '').replace(/,(\s*[}\]])/g, '$1'))
}

/** Extracts the zip payload from a CRX2/CRX3 package (or passes a plain zip through). */
export function unpackCrx(buf: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let offset = 0
  if (strFromU8(buf.subarray(0, 4)) === 'Cr24') {
    const version = view.getUint32(4, true)
    offset = version === 3
      ? 12 + view.getUint32(8, true)
      : 16 + view.getUint32(8, true) + view.getUint32(12, true)
  } else if (buf[0] !== 0x50 || buf[1] !== 0x4B) {
    throw new Error('Not a CRX or zip package')
  }
  // Only JSON is needed; skip inflating the rest (some packages are >100 MB)
  return unzipSync(buf.subarray(offset), { filter: file => /\.json$/i.test(file.name) })
}

/** Reads the manifest, managed schema and default-locale messages from an unpacked extension. */
export function readExtensionPackage(files: Record<string, Uint8Array>) {
  const read = (path: string) => {
    const key = Object.keys(files).find(k => k.toLowerCase() === path.replace(/^\//, '').toLowerCase())
    return key ? parseLenientJson(strFromU8(files[key])) : undefined
  }
  const manifest = read('manifest.json')
  if (!manifest) throw new Error('No manifest.json in extension package')
  const schemaPath = manifest.storage?.managed_schema
  if (!schemaPath) throw new Error(`${manifest.name} has no storage.managed_schema`)
  const schema = read(schemaPath)
  if (!schema) throw new Error(`Managed schema ${schemaPath} not found in extension package`)
  const messages = manifest.default_locale ? read(`_locales/${manifest.default_locale}/messages.json`) : undefined
  return { manifest, schema, messages: messages as Record<string, { message: string }> | undefined }
}

class XmlWriter {
  lines: string[] = []
  private depth = 0
  open(tag: string, attrs: Record<string, string | number | undefined> = {}, selfClose = false) {
    const a = Object.entries(attrs).filter(([, v]) => v !== undefined)
      .map(([k, v]) => ` ${k}="${escapeXml(String(v))}"`).join('')
    this.lines.push(`${'  '.repeat(this.depth)}<${tag}${a}${selfClose ? '/' : ''}>`)
    if (!selfClose) this.depth++
    return this
  }
  leaf(tag: string, attrs: Record<string, string | number | undefined> = {}, text?: string) {
    if (text === undefined) return this.open(tag, attrs, true)
    this.open(tag, attrs)
    this.depth--
    this.lines[this.lines.length - 1] += `${escapeXml(text)}</${tag}>`
    return this
  }
  close(tag: string) {
    this.depth--
    this.lines.push(`${'  '.repeat(this.depth)}</${tag}>`)
    return this
  }
  raw(line: string) { this.lines.push(`${'  '.repeat(this.depth)}${line}`); return this }
  toString() { return this.lines.join('\n') + '\n' }
}

/** Reads the version and fingerprint recorded by generateExtensionAdmx */
export function readTemplateStamp(admx: string): { version?: string; fingerprint?: string } {
  const header = admx.match(/<!--[^\n]*?-->/)?.[0] ?? ''
  return { version: header.match(/ version: (\S+)/)?.[1], fingerprint: header.match(/ generator: ([^\s-]+)/)?.[1] }
}

/** Compares extension versions, ignoring trailing zero components (1.2 == 1.2.0.0) */
export const sameVersion = (a: string, b: string) => {
  const norm = (v: string) => v.split('.').map(Number).join('.').replace(/(\.0)+$/, '')
  return norm(a) === norm(b)
}

export function generateExtensionAdmx(input: ExtensionTemplateInput): { admx: string; adml: string } {
  const displayName = input.name
  const rootKey = `${REGISTRY_ROOT}\\${input.id}\\policy`
  const messages = Object.fromEntries(
    Object.entries(input.messages ?? {}).map(([k, v]) => [k.toLowerCase(), v?.message])
  )
  const localize = (s: string | undefined) =>
    s?.replace(/__MSG_(\w+?)__/g, (m, key) => messages[key.toLowerCase()] ?? m)

  // Collect every `id` up front so `$ref`s resolve regardless of declaration order.
  const schemaIds = new Map<string, any>()
  const collectIds = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.id === 'string' && node.type) schemaIds.set(node.id, node)
    for (const value of Object.values(node)) collectIds(value)
  }
  collectIds(input.schema)
  const resolve = (node: any, seen = new Set<string>()): any => {
    if (!node?.$ref || seen.has(node.$ref)) return node
    const target = schemaIds.get(node.$ref)
    if (!target) throw new Error(`Unresolved $ref "${node.$ref}"`)
    seen.add(node.$ref)
    const { $ref, ...rest } = node
    return { ...resolve(target, seen), ...rest }
  }

  const strings = new Map<string, string>()
  const usedIds = new Set<string>()
  const uniqueId = (base: string) => {
    let id = base, n = 2
    while (usedIds.has(id)) id = `${base}_${n++}`
    usedIds.add(id)
    return id
  }
  const addString = (id: string, text: string) => { strings.set(id, text); return `$(string.${id})` }

  const categories: { name: string; displayName: string; parent: string }[] = []
  const policies = new XmlWriter()
  const presentations = new XmlWriter()
  const prefix = `ext_${input.id}`
  const rootCategory = uniqueId('extension')
  categories.push({ name: rootCategory, displayName, parent: `${PARENT.prefix}:${PARENT.category}` })

  const explain = (schema: any) => {
    const parts = [localize(schema.description)].filter(Boolean) as string[]
    if (schema.enum) parts.push(`Allowed values: ${schema.enum.map((v: any) => JSON.stringify(v)).join(', ')}`)
    if (schema.default !== undefined && typeof schema.default !== 'object')
      parts.push(`Default: ${JSON.stringify(schema.default)}`)
    return parts.join('\n\n')
  }

  const jsonHint = (schema: any) => schema.type === 'object' || schema.type === 'array'

  const addPolicy = (name: string, rawSchema: any, parentCategory: string, parentKey: string) => {
    const schema = resolve(rawSchema)
    const title = localize(schema.title) || name
    const fullName = uniqueId(`${parentCategory}_${toId(name)}`)

    if (schema.type === 'object' && schema.properties && Object.keys(schema.properties).length) {
      categories.push({ name: fullName, displayName: title, parent: parentCategory })
      for (const [childName, childSchema] of Object.entries(schema.properties))
        addPolicy(childName, childSchema, fullName, `${parentKey}\\${name}`)
      return
    }

    const partId = `${fullName}_Part`
    const explainText = explain(schema)
    policies.open('policy', {
      name: fullName,
      class: 'Both',
      displayName: addString(fullName, title),
      explainText: explainText ? addString(uniqueId(`${fullName}_Explain`), explainText) : undefined,
      presentation: schema.type === 'boolean' ? undefined : `$(presentation.${fullName})`,
      key: parentKey,
      valueName: schema.type === 'boolean' ? name : undefined,
    })
    policies.leaf('parentCategory', { ref: parentCategory })
    policies.leaf('supportedOn', { ref: 'SUPPORTED_EXTENSION' })

    if (schema.type === 'boolean') {
      policies.open('enabledValue').leaf('decimal', { value: 1 }).close('enabledValue')
      policies.open('disabledValue').leaf('decimal', { value: 0 }).close('disabledValue')
      policies.close('policy')
      return
    }

    presentations.open('presentation', { id: fullName })
    policies.open('elements')
    if (Array.isArray(schema.enum) && (schema.type === 'string' || schema.type === 'integer')) {
      policies.open('enum', { id: partId, valueName: name })
      schema.enum.forEach((value: string | number, i: number) => {
        policies.open('item', { displayName: addString(uniqueId(`${fullName}_Item${i}`), String(value)) })
          .open('value').leaf(schema.type === 'integer' ? 'decimal' : 'string', schema.type === 'integer' ? { value } : {}, schema.type === 'integer' ? undefined : String(value))
          .close('value').close('item')
      })
      policies.close('enum')
      presentations.leaf('dropdownList', { refId: partId }, title)
    } else if (schema.type === 'integer' && !(schema.minimum < 0)) {
      policies.leaf('decimal', {
        id: partId, valueName: name,
        minValue: schema.minimum ?? 0,
        maxValue: Math.min(schema.maximum ?? DECIMAL_MAX, DECIMAL_MAX),
      })
      presentations.leaf('decimalTextBox', { refId: partId }, title)
    } else if (schema.type === 'array') {
      // Chromium reads lists from a subkey with values named 1, 2, 3...
      policies.leaf('list', { id: partId, key: `${parentKey}\\${name}`, valuePrefix: '' })
      const items = resolve(schema.items ?? {})
      presentations.leaf('listBox', { refId: partId }, jsonHint(items) ? `${title} (one JSON value per entry)` : title)
    } else if (['string', 'number', 'integer', 'object'].includes(schema.type)) {
      // Numbers are doubles, which ADMX can't express; objects without fixed
      // properties are JSON. Chromium converts both from strings via the schema.
      policies.leaf('text', { id: partId, valueName: name, maxLength: 1048576 })
      presentations.open('textBox', { refId: partId })
        .leaf('label', {}, jsonHint(schema) ? `${title} (JSON)` : title)
        .close('textBox')
    } else {
      throw new Error(`Unhandled schema type "${schema.type}" for ${name}`)
    }
    policies.close('elements')
    presentations.close('presentation')
    policies.close('policy')
  }

  for (const [name, schema] of Object.entries(input.schema.properties ?? {}))
    addPolicy(name, schema, rootCategory, rootKey)

  const comment = `<!--${displayName} ${input.id}${input.version ? ` version: ${input.version}` : ''}${input.fingerprint ? ` generator: ${input.fingerprint}` : ''}-->`

  const admx = new XmlWriter()
  admx.raw('<?xml version="1.0" encoding="utf-8"?>')
  admx.open('policyDefinitions', { revision: '1.0', schemaVersion: '1.0', xmlns: 'http://www.microsoft.com/GroupPolicy/PolicyDefinitions' })
  admx.raw(comment)
  admx.open('policyNamespaces')
    .leaf('target', { namespace: `BrowserExtension.${input.id}`, prefix })
    .leaf('using', { namespace: PARENT.namespace, prefix: PARENT.prefix })
    .leaf('using', { namespace: 'Microsoft.Policies.Windows', prefix: 'windows' })
    .close('policyNamespaces')
  admx.leaf('resources', { minRequiredRevision: '1.0' })
  admx.open('supportedOn').open('definitions')
    .leaf('definition', { name: 'SUPPORTED_EXTENSION', displayName: addString('SUPPORTED_EXTENSION', `${input.name} browser extension`) })
    .close('definitions').close('supportedOn')
  admx.open('categories')
  for (const cat of categories) {
    admx.open('category', { name: cat.name, displayName: addString(cat.name, cat.displayName) })
      .leaf('parentCategory', { ref: cat.parent })
      .close('category')
  }
  admx.close('categories')
  admx.open('policies')
  for (const line of policies.lines) admx.raw(line)
  admx.close('policies')
  admx.close('policyDefinitions')

  const adml = new XmlWriter()
  adml.raw('<?xml version="1.0" encoding="utf-8"?>')
  adml.open('policyDefinitionResources', { revision: '1.0', schemaVersion: '1.0', xmlns: 'http://www.microsoft.com/GroupPolicy/PolicyDefinitions' })
  adml.raw(comment)
  adml.leaf('displayName', {}, displayName)
  adml.leaf('description', {}, `Policies for the ${input.name} browser extension, generated from its managed storage schema`)
  adml.open('resources')
  adml.open('stringTable')
  for (const [id, text] of strings) adml.leaf('string', { id }, text)
  adml.close('stringTable')
  if (presentations.lines.length) {
    adml.open('presentationTable')
    for (const line of presentations.lines) adml.raw(line)
    adml.close('presentationTable')
  } else adml.leaf('presentationTable')
  adml.close('resources')
  adml.close('policyDefinitionResources')

  return { admx: admx.toString(), adml: adml.toString() }
}

/** The "Browser Extensions" category that every generated extension template is nested under. */
export function generateExtensionCategoryAdmx(): { admx: string; adml: string } {
  const header = '<?xml version="1.0" encoding="utf-8"?>'
  const attrs = 'revision="1.0" schemaVersion="1.0" xmlns="http://www.microsoft.com/GroupPolicy/PolicyDefinitions"'
  const admx = [
    header,
    `<policyDefinitions ${attrs}>`,
    '  <policyNamespaces>',
    `    <target namespace="${PARENT.namespace}" prefix="${PARENT.prefix}"/>`,
    '  </policyNamespaces>',
    '  <resources minRequiredRevision="1.0"/>',
    '  <categories>',
    `    <category name="${PARENT.category}" displayName="$(string.${PARENT.category})"/>`,
    '  </categories>',
    '  <policies/>',
    '</policyDefinitions>',
  ]
  const adml = [
    header,
    `<policyDefinitionResources ${attrs}>`,
    '  <displayName>Browser Extensions</displayName>',
    '  <description>Parent category for browser extension policies</description>',
    '  <resources>',
    '    <stringTable>',
    `      <string id="${PARENT.category}">Browser Extensions</string>`,
    '    </stringTable>',
    '  </resources>',
    '</policyDefinitionResources>',
  ]
  return { admx: admx.join('\n') + '\n', adml: adml.join('\n') + '\n' }
}
