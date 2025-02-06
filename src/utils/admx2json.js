import fs from 'fs'
import util from 'util'
import path, { join } from 'path'
import { convert } from './admx.js'

const isUtf16 = (buffer) => {
    // Check for UTF-16 LE BOM (FF FE)
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) return true;
    // Check for UTF-16 BE BOM (FE FF)
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) return true;
    return false;
}

// adapted from TemplateMgmt.vue
const processFolder = async (cwd, files, res) => {
    for (const file of files) {
        console.log('Processing', file)
        if (
            file.toLowerCase().endsWith('.admx') ||
            file.toLowerCase().endsWith('.adml')
        ) {
            const buffer = fs.readFileSync(join(cwd, file))
            const text = buffer.toString(isUtf16(buffer) ? 'utf16le' : 'utf8')
            res.push({
                name: file,
                content: text
            })
        }
    }
}

const folderPath = process.argv[2]

if (!folderPath) {
    console.error('Please provide a folder path')
    process.exit(1)
}

try {
    const results = []
    const files = fs.readdirSync(folderPath, { recursive: true })
    await processFolder(folderPath, files, results)

    const converted = await convert(results)
    const outputPath = path.join(process.cwd(), '..', 'public', 'admx.json')
    console.dir(util.inspect(converted, false, null))

    fs.writeFileSync(outputPath, JSON.stringify(converted))
    console.log(`Conversion complete. Output written to ${outputPath}`)
} catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
}
