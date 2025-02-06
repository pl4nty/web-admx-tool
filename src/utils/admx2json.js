import fs from 'fs'
import path, { join } from 'path'
import { convert } from './admx.js'

// adapted from TemplateMgmt.vue
const processFolder = async (cwd, files, res) => {
    for (const file of files) {
        console.log('Processing', file)
        if (
            file.toLowerCase().endsWith('.admx') ||
            file.toLowerCase().endsWith('.adml')
        ) {
            const fileBuffer = fs.readFileSync(join(cwd, file))
            const header = fileBuffer.toString('utf8', 0, 200)
            const encoding = header.includes('encoding="utf-16"') ? 'utf16le' : 'utf8'
            const text = fileBuffer.toString(encoding)
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

    const converted = convert(results)
    const outputPath = path.join(process.cwd(), '..', 'public', 'admx.json')
    console.log(converted)

    fs.writeFileSync(outputPath, JSON.stringify(converted))
    console.log(`Conversion complete. Output written to ${outputPath}`)
} catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
}
