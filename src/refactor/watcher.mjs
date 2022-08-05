import path from 'node:path'
import Watcher from 'watcher'
import { readDocumentSheets, readHighlighter, writeDocumentSheets, writeHighlighter } from './utils.mjs'

const watchPath = process.argv[2]
const fullPath = path.resolve(process.cwd(), watchPath)

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

  const documentsSheets = readDocumentSheets(fullPath)
  const highlighter = readHighlighter(fullPath, newConfigId)

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

  writeHighlighter(fullPath, newConfigId, refactoredHighlighter)
  writeDocumentSheets(fullPath, refactoredDocumentsSheet)
}

function onRenameDocument (oldName, newName) {
  const oldTextDocumentId = path.basename(oldName, '.txt')
  const newTextDocumentId = path.basename(newName, '.txt')

  console.log(`rename document ${oldTextDocumentId} => ${newTextDocumentId}`)

  const documentsSheets = readDocumentSheets(fullPath)

  let changeCount = 0

  const refactoredDocumentsSheet = documentsSheets.map((documentSheet) => {
    if (documentSheet.textDocumentId !== oldTextDocumentId) {
      return documentSheet
    }

    changeCount += 1

    return { ...documentSheet, textDocumentId: newTextDocumentId }
  })

  console.log(`changed ${changeCount} sheets`)

  writeDocumentSheets(fullPath, refactoredDocumentsSheet)
}




