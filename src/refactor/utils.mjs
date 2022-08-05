import fs from 'node:fs'
import path from 'node:path'

export function readDocumentSheets (basePath) {
  return JSON.parse(fs.readFileSync(path.join(basePath, "_documentsheets"), { encoding: 'utf8', flag: 'r' }))
}

export function writeDocumentSheets (basePath, documentsSheets) {
  fs.writeFileSync(path.join(basePath, "_documentsheets"), JSON.stringify(documentsSheets, null, 2))
}

export function readHighlighter (basePath, id) {
  return JSON.parse(fs.readFileSync(path.join(basePath, `${id}.highlighter`)))
}

export function writeHighlighter (basePath, id, highlighter) {
  fs.writeFileSync(path.join(basePath, `${id}.highlighter`), JSON.stringify(highlighter, null, 2))
}


