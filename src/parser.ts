import { readFileSync } from 'node:fs'
import { parseString } from 'xml2js'

export function readXmlFile(path: string): string {
  const buf = readFileSync(path)
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').replace(/^\uFEFF/, '')
  if (buf[0] === 0xfe && buf[1] === 0xff) return buf.swap16().toString('utf16le').replace(/^\uFEFF/, '')
  return buf.toString('utf8').replace(/^\uFEFF/, '')
}

interface PolicyValue { type?: string; value?: string | number }
interface PolicyListItem { key?: string; valueName?: string; value?: PolicyValue | null }
interface PolicyElement {
  type: string; id?: string; valueName?: string; key?: string; required?: boolean
  items?: { displayName?: string; value?: PolicyValue | null }[]
  minValue?: number; maxValue?: number; maxLength?: number
  expandable?: boolean; explicitValue?: boolean; additive?: boolean; valuePrefix?: string
  trueValue?: PolicyValue | null; falseValue?: PolicyValue | null
  trueList?: PolicyListItem[] | null; falseList?: PolicyListItem[] | null
}
interface PresentationElement { type: string; refId?: string; label?: string; defaultValue?: string | number }

const XML_OPTS = { explicitArray: false, mergeAttrs: true, charkey: '_text', trim: true }

export function parseXml(xml: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if (xml[0] === '\uFEFF') xml = xml.slice(1)
    xml = xml.replace(/<!DOCTYPE[\s\S]*?\]>\s*/g, '')
    parseString(xml, XML_OPTS, (err, result) => err ? reject(err) : resolve(result))
  })
}

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

function resolveStringRef(ref: string | undefined, strings: Record<string, string>) {
  const m = ref?.match(/\$\(string\.(.+?)\)/)
  return m ? (strings[m[1]] || ref) : ref
}

function resolvePresentationRef(ref: string | undefined, presentations: Record<string, PresentationElement[]>) {
  const m = ref?.match(/\$\(presentation\.(.+?)\)/)
  return m ? presentations[m[1]] : null
}

function parseValue(node: any): PolicyValue | null {
  if (!node) return null
  if (node.decimal) return { type: 'decimal', value: parseInt(node.decimal.value) }
  if (node.string) return { type: 'string', value: node.string._text || node.string || '' }
  if (node.delete) return { type: 'delete' }
  return null
}

function parseValueList(node: any): PolicyListItem[] | null {
  if (!node) return null
  return toArray(node.item).map(item => ({
    key: item.key, valueName: item.valueName, value: parseValue(item.value)
  }))
}

const ELEMENT_TYPES = ['enum', 'decimal', 'text', 'boolean', 'list', 'multiText', 'longDecimal'] as const
const INT_PROPS = ['minValue', 'maxValue', 'maxLength'] as const
const BOOL_PROPS = ['required', 'expandable', 'explicitValue', 'additive'] as const

function parseElements(elements: any): PolicyElement[] {
  if (!elements) return []
  const result: any[] = []
  for (const type of ELEMENT_TYPES) {
    for (const el of toArray(elements[type])) {
      const parsed: any = { type, id: el.id, valueName: el.valueName }
      if (el.key) parsed.key = el.key
      for (const p of BOOL_PROPS) if (el[p]) parsed[p] = el[p] === 'true'
      for (const p of INT_PROPS) if (el[p]) parsed[p] = parseInt(el[p])
      if (el.valuePrefix) parsed.valuePrefix = el.valuePrefix
      if (type === 'enum') {
        parsed.items = toArray(el.item).map(item => ({
          displayName: item.displayName, value: parseValue(item.value)
        }))
      }
      if (type === 'boolean') {
        parsed.trueValue = parseValue(el.trueValue)
        parsed.falseValue = parseValue(el.falseValue)
        parsed.trueList = parseValueList(el.trueList)
        parsed.falseList = parseValueList(el.falseList)
      }
      result.push(parsed)
    }
  }
  return result
}

const PRESENTATION_TYPES = ['dropdownList', 'decimalTextBox', 'textBox', 'checkBox', 'listBox', 'multiTextBox', 'text'] as const

function parsePresentationElements(pres: any): PresentationElement[] {
  if (!pres) return []
  const result: any[] = []
  for (const type of PRESENTATION_TYPES) {
    for (const el of toArray(pres[type])) {
      if (typeof el === 'string') { result.push({ type: 'text', label: el }); continue }
      const label = type === 'textBox' && el.label
        ? (typeof el.label === 'object' ? el.label._text : el.label)
        : (el._text || el.label)
      result.push({
        type, refId: el.refId,
        ...(label && { label }),
        ...(el.defaultValue !== undefined && { defaultValue: el.defaultValue }),
      })
    }
  }
  return result
}

export async function parseAdml(xml: string) {
  const doc = await parseXml(xml)
  const res = doc.policyDefinitionResources?.resources
  if (!res) return { strings: {}, presentations: {} }

  const strings = {}
  for (const s of toArray(res.stringTable?.string)) {
    if (s.id) strings[s.id] = s._text || ''
  }

  const presentations = {}
  for (const p of toArray(res.presentationTable?.presentation)) {
    if (p.id) presentations[p.id] = parsePresentationElements(p)
  }

  return { strings, presentations }
}

export async function parseAdmx(xml: string) {
  const doc = await parseXml(xml)
  const pd = doc.policyDefinitions
  if (!pd) throw new Error('Invalid ADMX: missing <policyDefinitions>')

  const ns = pd.policyNamespaces
  const target = { prefix: ns?.target?.prefix, namespace: ns?.target?.namespace }
  const using = toArray(ns?.using).map(u => ({ prefix: u.prefix, namespace: u.namespace }))

  const supportedOn = {}
  for (const def of toArray(pd.supportedOn?.definitions?.definition)) {
    supportedOn[def.name] = { displayName: def.displayName }
  }

  const categories = toArray(pd.categories?.category).map(cat => ({
    name: cat.name,
    displayName: cat.displayName,
    parentRef: cat.parentCategory?.ref || null
  }))

  const policies = toArray(pd.policies?.policy).map(pol => ({
    name: pol.name,
    class: pol.class, // Machine, User, Both
    displayName: pol.displayName,
    explainText: pol.explainText,
    presentation: pol.presentation,
    key: pol.key,
    valueName: pol.valueName,
    parentCategory: pol.parentCategory?.ref || null,
    supportedOn: pol.supportedOn?.ref || null,
    enabledValue: parseValue(pol.enabledValue),
    disabledValue: parseValue(pol.disabledValue),
    enabledList: parseValueList(pol.enabledList),
    disabledList: parseValueList(pol.disabledList),
    elements: parseElements(pol.elements),
  }))

  return { target, using, supportedOn, categories, policies }
}

export function resolveAdmxStrings(admx: any, adml: { strings: Record<string, string>; presentations: Record<string, PresentationElement[]> }) {
  const { strings, presentations } = adml
  return {
    ...admx,
    categories: admx.categories.map(cat => ({
      ...cat,
      displayName: resolveStringRef(cat.displayName, strings)
    })),
    supportedOn: Object.fromEntries(
      Object.entries(admx.supportedOn).map(([k, v]: [string, any]) => [k, {
        ...v,
        displayName: resolveStringRef(v.displayName, strings)
      }])
    ),
    policies: admx.policies.map(pol => {
      const presElements = (resolvePresentationRef(pol.presentation, presentations) || [])
        .map(pe => ({ ...pe, label: resolveStringRef(pe.label, strings) }))
      return {
        ...pol,
        displayName: resolveStringRef(pol.displayName, strings),
        explainText: resolveStringRef(pol.explainText, strings),
        presentationElements: presElements,
        elements: pol.elements.map(el =>
          el.type === 'enum'
            ? { ...el, items: el.items.map(item => ({ ...item, displayName: resolveStringRef(item.displayName, strings) })) }
            : el
        )
      }
    })
  }
}
