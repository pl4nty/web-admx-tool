import { parseStringPromise } from 'xml2js'

const PARSE_OPTS = {
    charkey: '#text',
    explicitArray: false,
    mergeAttrs: true
}

async function parseXml(text) {
    return parseStringPromise(text, PARSE_OPTS)
}

/**
 * Parse a list of { name, content } ADMX/ADML files into the admx.json format.
 * Preserves presentation elements without stripping them.
 */
export async function parseFiles(files) {
    const parsed = await Promise.all(
        files.map(async f => ({
            name: f.name,
            content: await parseXml(f.content)
        }))
    )

    const result = {}

    // Index ADMX files (root level – no directory separator)
    const admxFiles = parsed.filter(f => !f.name.includes('/') && f.name.toLowerCase().endsWith('.admx'))
    for (const f of admxFiles) {
        const key = f.name.split('.')[0].toLowerCase()
        if (!result[key]) result[key] = {}
        // Strip a few unnecessary attributes but keep everything else
        const pd = f.content.policyDefinitions
        if (pd) {
            delete pd.revision
            delete pd.schemaVersion
            delete pd['xmlns']
            delete pd['xmlns:xsd']
            delete pd['xmlns:xsi']
        }
        result[key].policy = f.content
    }

    // Index ADML files (inside lang subdirectory, e.g. en-US/chrome.adml)
    const admlFiles = parsed.filter(f => f.name.includes('/'))
    for (const f of admlFiles) {
        const parts = f.name.split('/')
        const lang = parts[0].toLowerCase()
        const key = parts[1].split('.')[0].toLowerCase()
        if (result[key]) {
            const pdr = f.content.policyDefinitionResources
            if (pdr) {
                delete pdr.revision
                delete pdr.schemaVersion
                delete pdr['xmlns']
                delete pdr['xmlns:xsd']
                delete pdr['xmlns:xsi']
            }
            result[key][lang] = f.content
        }
    }

    return result
}
