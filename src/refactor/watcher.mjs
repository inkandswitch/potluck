import path from 'node:path'
import fs from 'node:fs'
import Watcher from 'watcher'

const watchPath = process.argv[2]
const fullPath = path.resolve(process.cwd(), watchPath)
const documentsSheetsPath = path.join(fullPath, '_documentsheets')

console.log('watching ', fullPath)

const watcher = new Watcher(fullPath, { renameDetection: true })

watcher.on('rename', (filePath, filePathNext) => {
  if (filePath.endsWith('.txt') && filePathNext.endsWith('.txt')) {
    onRenameDocument(filePath, filePathNext)
  } else if (filePath.endsWith('.highlighter') && filePathNext.endsWith('.highlighter')) {
    onRenameHighlighter(filePath, filePathNext)
  }
})

function onRenameHighlighter (oldName, newName) {
  const oldConfigId = path.basename(oldName, '.highlighter')
  const newConfigId = path.basename(newName, '.highlighter')

  console.log(`rename highlighter ${oldConfigId} => ${newConfigId}`)

  const documentsSheets = readDocumentsSheets()
  const highlighter = readHighlighter(newConfigId)

  let changeCount = 0

  const refactoredHighlighter = { ...highlighter, id: newConfigId }
  const refactoredDocumentsSheet = documentsSheets.map((documentSheet) => {
    if (documentSheet.configId !== oldConfigId) {
      return documentSheet
    }

    changeCount += 1

    return { ...documentSheet, configId: newConfigId }
  })

  console.log(`changed ${changeCount} sheets`)

  writeHighlighter(newConfigId, refactoredHighlighter)
  writeDocumentsSheets(refactoredDocumentsSheet)
}

function onRenameDocument (oldName, newName) {
  const oldTextDocumentId = path.basename(oldName, '.txt')
  const newTextDocumentId = path.basename(newName, '.txt')

  console.log(`rename document ${oldTextDocumentId} => ${newTextDocumentId}`)

  const documentsSheets = readDocumentsSheets()

  let changeCount = 0

  const refactoredDocumentsSheet = documentsSheets.map((documentSheet) => {
    if (documentSheet.textDocumentId !== oldTextDocumentId) {
      return documentSheet
    }

    changeCount += 1

    return { ...documentSheet, textDocumentId: newTextDocumentId }
  })

  console.log(`changed ${changeCount} sheets`)

  writeDocumentsSheets(refactoredDocumentsSheet)
}

function readDocumentsSheets () {
  return JSON.parse(fs.readFileSync(documentsSheetsPath, { encoding: 'utf8', flag: 'r' }))
}

function writeDocumentsSheets (documentsSheets) {
  fs.writeFileSync(documentsSheetsPath, JSON.stringify(documentsSheets, null, 2))
}

function readHighlighter (id) {
  return JSON.parse(fs.readFileSync(path.join(watchPath, `${id}.highlighter`)))
}

function writeHighlighter (id, highlighter) {
  fs.writeFileSync(path.join(watchPath, `${id}.highlighter`), JSON.stringify(highlighter, null, 2))
}





