import fs from 'node:fs'
import path from 'node:path'
import { readDocumentSheets } from './utils.mjs'

const watchPath = process.argv[2]
const fullPath = path.resolve(process.cwd(), watchPath)

const documentSheets = readDocumentSheets(watchPath)

fs.readdirSync(fullPath).forEach(file => {
  if (
    file.startsWith('_') &&
    file.endsWith('.highlighter')
  ) {
    const configId = path.basename(file, '.highlighter')

    if (documentSheets.every((sheet) => sheet.configId !== configId)) {
      fs.unlinkSync(path.join(fullPath, file))
    }
  }
})