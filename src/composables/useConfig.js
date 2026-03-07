import { useAdmx } from './useAdmx'

const { resolveString, resolvePresentation, toArr } = useAdmx()

// ── Helpers ───────────────────────────────────────────────────────────────────

const toBool = val => val === true || String(val).toLowerCase() === 'true'
const toNum = (val, def) => {
    if (typeof val === 'number') return val
    const n = Number(val)
    return isNaN(n) ? def : n
}

function getVal(valueEl) {
    let del = false, long = false, ret
    if (valueEl?.decimal) ret = Number(valueEl.decimal.value ?? valueEl.decimal['#text'] ?? 0)
    if (valueEl?.longDecimal) { ret = Number(valueEl.longDecimal.value ?? valueEl.longDecimal['#text'] ?? 0); long = true }
    if (valueEl?.string) ret = String(valueEl.string.value ?? valueEl.string['#text'] ?? '')
    if (valueEl?.delete) del = true
    return { del, long, ret }
}

function regVal(value, scopeStr, key, valueName) {
    const { del, long, ret } = getVal(value)
    const action = del ? 'del' : 'set'
    let type = null
    if (typeof ret === 'string') type = 'REG_SZ'
    if (typeof ret === 'number') type = long ? 'REG_QWORD' : 'REG_DWORD'
    return { action, type, scope: scopeStr, key, valueName, val: ret }
}

function regValueAndList(po, el, value, valList, boolVal) {
    const results = []
    const scopeStr = po.scope
    const defaultKey = el.key ?? po.raw.key
    const defaultValueName = el.valueName ?? po.raw.valueName

    if (!value && !valList && typeof boolVal === 'boolean' && defaultKey && defaultValueName) {
        value = { decimal: { value: boolVal ? 1 : 0 } }
    }
    if (value) results.push(regVal(value, scopeStr, defaultKey, defaultValueName))
    if (valList) {
        const itemDefaultKey = valList.defaultKey
        for (const item of toArr(valList.item)) {
            const key = item.key ?? itemDefaultKey ?? defaultKey
            const valueName = item.valueName ?? defaultValueName
            results.push(regVal(item.value, scopeStr, key, valueName))
        }
    }
    return results
}

function findElement(policy, id, type) {
    return toArr(policy.raw.elements?.[type]).find(e => e.id === id)
}

// ── Component builders ────────────────────────────────────────────────────────

function buildDropdown(policy, refId, labelText) {
    const el = findElement(policy, refId, 'enum')
    if (!el) return null
    const noSort = toBool(el.noSort)
    let items = toArr(el.item).map((item, idx) => ({
        val: idx,
        label: resolveString(policy.file, item.displayName)
    }))
    if (!noSort) items.sort((a, b) => a.label.localeCompare(b.label))
    const required = toBool(el.required)
    return {
        type: 'dropdown',
        prop: refId,
        label: labelText,
        defaultValue: null,
        options: items,
        validate(val) {
            if (required && (val === null || val === undefined)) throw new Error(`${labelText} is required`)
        },
        display(val) { return items.find(i => i.val === val)?.label ?? '' },
        reg(val) {
            if (val === null || val === undefined) return []
            const targetItem = toArr(el.item)[val]
            if (!targetItem) return []
            return regValueAndList(policy, el, targetItem.value, targetItem.valueList)
        }
    }
}

function buildCheckbox(policy, refId, labelText) {
    const el = findElement(policy, refId, 'boolean')
    if (!el) return null
    const defaultChecked = false
    return {
        type: 'checkbox',
        prop: refId,
        label: labelText,
        defaultValue: defaultChecked,
        validate() {},
        display(val) { return val ? 'true' : 'false' },
        reg(val) {
            if (val === true) return regValueAndList(policy, el, el.trueValue, el.trueList, true)
            if (val === false) return regValueAndList(policy, el, el.falseValue, el.falseList, false)
            return []
        }
    }
}

function buildTextbox(policy, refId, labelText, defaultText) {
    const el = findElement(policy, refId, 'text')
    if (!el) return null
    const required = toBool(el.required)
    const maxLength = toNum(el.maxLength, 65535)
    const expandable = toBool(el.expandable)
    return {
        type: 'textbox',
        prop: refId,
        label: labelText,
        defaultValue: defaultText ?? '',
        validate(val) {
            if (required && !val) throw new Error(`${labelText} is required`)
            if (val && val.length > maxLength) throw new Error(`${labelText} exceeds max length of ${maxLength}`)
        },
        display(val) { return val },
        reg(val) {
            const key = el.key ?? policy.raw.key
            const valueName = el.valueName ?? policy.raw.valueName
            return [{ action: 'set', type: expandable ? 'REG_EXPAND_SZ' : 'REG_SZ', scope: policy.scope, key, valueName, val }]
        }
    }
}

function buildMultiTextbox(policy, refId, labelText) {
    const el = findElement(policy, refId, 'multiText')
    if (!el) return null
    const required = toBool(el.required)
    const maxLength = toNum(el.maxLength, 65535)
    return {
        type: 'multitextbox',
        prop: refId,
        label: labelText,
        defaultValue: '',
        validate(val) {
            const cnt = val ? val.split('\n').filter(l => l.length > 0).length : 0
            if (required && cnt === 0) throw new Error(`${labelText} is required`)
            if (val && val.length > maxLength) throw new Error(`${labelText} exceeds max length`)
        },
        display(val) { return val ? val.split('\n').filter(l => l).join('; ') : '' },
        reg(val) {
            const key = el.key ?? policy.raw.key
            const valueName = el.valueName ?? policy.raw.valueName
            const lines = val ? val.split('\n').filter(l => l.length > 0) : []
            return [{ action: 'set', type: 'REG_MULTI_SZ', scope: policy.scope, key, valueName, val: lines }]
        }
    }
}

function buildDecimal(policy, refId, labelText, defaultVal) {
    const el = findElement(policy, refId, 'decimal')
    if (!el) return null
    const minValue = toNum(el.minValue, 0)
    const maxValue = toNum(el.maxValue, 65535)
    const spinStep = toNum(el.spinStep, 1)
    const storeAsText = toBool(el.storeAsText)
    let def = toNum(defaultVal, minValue)
    if (def < minValue) def = minValue
    if (def > maxValue) def = maxValue
    return {
        type: 'decimal',
        prop: refId,
        label: labelText,
        defaultValue: def,
        attrs: { minValue, maxValue, spinStep },
        validate() {},
        display(val) { return val },
        reg(val) {
            const key = el.key ?? policy.raw.key
            const valueName = el.valueName ?? policy.raw.valueName
            return [{ action: 'set', type: storeAsText ? 'REG_SZ' : 'REG_DWORD', scope: policy.scope, key, valueName, val: storeAsText ? String(val) : val }]
        }
    }
}

function buildList(policy, refId, labelText) {
    const el = findElement(policy, refId, 'list')
    if (!el) return null
    const additive = toBool(el.additive)
    const expandable = toBool(el.expandable)
    const explicitValue = toBool(el.explicitValue)
    const valuePrefix = el.valuePrefix ?? null
    return {
        type: 'list',
        prop: refId,
        label: labelText,
        defaultValue: [],
        attrs: { explicitValue },
        validate() {},
        display(val) {
            if (!val?.length) return ''
            if (explicitValue) return val.map(i => `${i.valueName}=${i.value}`).join('; ')
            return val.map(i => i.value).join('; ')
        },
        reg(val) {
            const key = el.key ?? policy.raw.key
            const regs = []
            if (!additive) regs.push({ action: 'del', type: null, scope: policy.scope, key, valueName: null, val: null })
            ;(val ?? []).forEach((v, i) => {
                const regType = expandable ? 'REG_EXPAND_SZ' : 'REG_SZ'
                const valueName = explicitValue ? v.valueName : (valuePrefix !== null ? `${valuePrefix}${i + 1}` : v.value)
                regs.push({ action: 'set', type: regType, scope: policy.scope, key, valueName, val: v.value })
            })
            return regs
        }
    }
}

// Map a raw presentation object to an array of component descriptors
function presentationToComponents(policy, presentation) {
    if (!presentation) return []
    const components = []

    // Element types to look for (in a logical display order)
    const ELEMENT_TYPES = ['text', 'checkBox', 'dropdownList', 'textBox', 'multiTextBox', 'decimalTextBox', 'listBox']

    for (const elType of ELEMENT_TYPES) {
        const elData = presentation[elType]
        if (!elData) continue

        for (const el of toArr(elData)) {
            if (elType === 'text') {
                // Static text label
                components.push({ type: 'text', val: typeof el === 'string' ? el : el['#text'] ?? '' })
                continue
            }
            const refId = el.refId
            const labelText = el['#text'] ?? el.label?.['#text'] ?? refId

            if (elType === 'dropdownList') {
                const comp = buildDropdown(policy, refId, labelText)
                if (comp) { comp.defaultValue = null; components.push(comp) }
            } else if (elType === 'checkBox') {
                const defaultChecked = toBool(el.defaultChecked)
                const comp = buildCheckbox(policy, refId, labelText)
                if (comp) { comp.defaultValue = defaultChecked; components.push(comp) }
            } else if (elType === 'textBox') {
                const defaultText = el.defaultValue?.['#text'] ?? el.defaultValue ?? ''
                const label = el.label?.['#text'] ?? el['#text'] ?? refId
                const comp = buildTextbox(policy, refId, label, defaultText)
                if (comp) components.push(comp)
            } else if (elType === 'multiTextBox') {
                const comp = buildMultiTextbox(policy, refId, labelText)
                if (comp) components.push(comp)
            } else if (elType === 'decimalTextBox') {
                const comp = buildDecimal(policy, refId, labelText, el.defaultValue)
                if (comp) components.push(comp)
            } else if (elType === 'listBox') {
                const comp = buildList(policy, refId, labelText)
                if (comp) components.push(comp)
            }
        }
    }
    return components
}

// ── Parsed policy ─────────────────────────────────────────────────────────────

function getParsedPolicy(policy) {
    if (!policy) return null
    const title = resolveString(policy.file, policy.raw.displayName)
    const presentation = resolvePresentation(policy.file, policy.raw.presentation)
    const components = presentationToComponents(policy, presentation)
    const defaultValue = {}
    for (const c of components) {
        if (c.type !== 'text') defaultValue[c.prop] = c.defaultValue
    }

    function statusReg(enabled) {
        if (enabled === true) {
            return regValueAndList(policy, {}, policy.raw.enabledValue, policy.raw.enabledList, true)
        }
        if (enabled === false) {
            return regValueAndList(policy, {}, policy.raw.disabledValue, policy.raw.disabledList, false)
        }
        return []
    }

    return { file: policy.file, id: policy.id, scope: policy.scope, title, components, defaultValue, statusReg }
}

// ── Config state ──────────────────────────────────────────────────────────────

const configs = ref([])
const curPolicy = ref(null)
const curConfig = ref({ enabled: null, comment: '', config: {} })

function resetConfig() {
    curConfig.value = { enabled: null, comment: '', config: {} }
}

function loadConfig() {
    const existing = configs.value.find(c => c.id === curPolicy.value?.id)
    if (existing) {
        curConfig.value = JSON.parse(JSON.stringify(existing))
    } else {
        resetConfig()
        const parsed = getParsedPolicy(curPolicy.value)
        if (parsed) curConfig.value.config = { ...parsed.defaultValue }
    }
}

function saveConfig() {
    const cfg = { ...curConfig.value, id: curPolicy.value.id }
    if (cfg.enabled !== true) cfg.config = {}
    const idx = configs.value.findIndex(c => c.id === cfg.id)
    if (idx >= 0) {
        if (cfg.enabled === null) configs.value.splice(idx, 1)
        else configs.value.splice(idx, 1, cfg)
    } else if (cfg.enabled !== null) {
        configs.value.push(cfg)
    }
}

const parsedPolicy = computed(() => getParsedPolicy(curPolicy.value))

const errorMsgs = computed(() => {
    if (curConfig.value.enabled !== true) return []
    const msgs = []
    for (const comp of parsedPolicy.value?.components ?? []) {
        if (comp.type === 'text' || !comp.validate) continue
        try {
            comp.validate(curConfig.value.config[comp.prop])
        } catch (e) {
            msgs.push(e.message)
        }
    }
    return msgs
})

function getParsedRegs() {
    return configs.value.map(cfg => {
        const policy = useAdmx().allPolicies.value.find(p => p.id === cfg.id)
        const parsed = getParsedPolicy(policy)
        if (!parsed) return null
        const regs = {}
        regs.statusRegs = parsed.statusReg(cfg.enabled)
        for (const [prop, val] of Object.entries(cfg.config)) {
            const comp = parsed.components.find(c => c.prop === prop)
            if (comp?.reg) regs[prop] = comp.reg(val)
        }
        return { id: cfg.id, title: parsed.title, regs }
    })
}

export function useConfig() {
    return {
        configs,
        curPolicy,
        curConfig,
        parsedPolicy,
        errorMsgs,
        resetConfig,
        loadConfig,
        saveConfig,
        getParsedPolicy,
        getParsedRegs
    }
}
