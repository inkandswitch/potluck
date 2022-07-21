import { Text } from "@codemirror/state";
import {
  directoryOpen,
  fileSave,
  FileWithDirectoryAndFileHandle,
} from "browser-fs-access";
import { comparer, reaction, runInAction } from "mobx";
import {
  selectedTextDocumentIdBox,
  sheetConfigsMobx,
  Span,
  TextDocument,
  textDocumentsMobx,
} from "./primitives";

// we'll always start file paths with / so "/foo.txt" is a foo.txt in the root
// directory.

const TEXT_FILE_EXTENSION = "txt";
const HIGHLIGHTER_FILE_EXTENSION = "highlighter";
const DOCUMENT_SHEET_CONFIG_FILEPATH = "/_documentsheets";

function getRelativePath(fileHandle: File) {
  return fileHandle.webkitRelativePath.substring(
    fileHandle.webkitRelativePath.indexOf("/")
  );
}

function getTextDocumentId(filePath: string) {
  return filePath.substring(
    1,
    filePath.length - TEXT_FILE_EXTENSION.length - 1
  );
}

function getHighlighterId(filePath: string) {
  return filePath.substring(
    1,
    filePath.length - HIGHLIGHTER_FILE_EXTENSION.length - 1
  );
}

export class DirectoryPersistence {
  directoryHandle: FileSystemDirectoryHandle | undefined;
  blobsInDirectory: FileWithDirectoryAndFileHandle[] | undefined;
  fileHandles: { [filePath: string]: FileSystemFileHandle } = {};
  fileCache: { [filePath: string]: string } = {};
  unsubscribes: (() => void)[] = [];

  constructor() {}

  async init() {
    this.blobsInDirectory = await directoryOpen({
      recursive: false,
      mode: "readwrite",
    });
    this.directoryHandle = this.blobsInDirectory.find(
      (blob) => blob.webkitRelativePath.split("/").length === 2
    )?.directoryHandle;
    if (this.directoryHandle === undefined) {
      throw new Error(
        "sorry! browser-fs-access requires at least one file in the directory"
      );
    }
    for (const file of this.blobsInDirectory) {
      const relativePath = getRelativePath(file);
      if (
        file.name.endsWith(`.${HIGHLIGHTER_FILE_EXTENSION}`) ||
        file.name.endsWith(`.${TEXT_FILE_EXTENSION}`) ||
        relativePath === DOCUMENT_SHEET_CONFIG_FILEPATH
      ) {
        if (file.handle !== undefined) {
          this.fileHandles[relativePath] = file.handle;
        }
        this.fileCache[relativePath] = await file.text();
      }
    }

    await this.initSync();
  }

  async initSync() {
    runInAction(() => {
      const documentSheetConfig: SerializedDocumentSheet[] = JSON.parse(
        this.fileCache[DOCUMENT_SHEET_CONFIG_FILEPATH] ?? "[]"
      );
      textDocumentsMobx.replace(
        new Map(
          Object.entries(this.fileCache)
            .filter(([filePath]) => filePath.endsWith(TEXT_FILE_EXTENSION))
            .map(([filePath, contents]) => {
              const id = getTextDocumentId(filePath);
              return [
                id,
                {
                  id,
                  name: contents.split("\n")[0],
                  // TODO: if the file is already open, update codemirror
                  text: Text.of(contents.split("\n").slice(1)),
                  sheets: documentSheetConfig
                    .filter((c) => c.textDocumentId === id)
                    .map((c) => ({
                      id: c.id,
                      configId: c.configId,
                      highlightSearchRange: c.highlightSearchRange,
                    })),
                },
              ];
            })
        )
      );
      const textDocumentIds = [...textDocumentsMobx.keys()];
      if (!textDocumentIds.includes(selectedTextDocumentIdBox.get())) {
        selectedTextDocumentIdBox.set(textDocumentIds[0]);
      }
      sheetConfigsMobx.replace(
        new Map(
          Object.entries(this.fileCache)
            .filter(([filePath]) =>
              filePath.endsWith(HIGHLIGHTER_FILE_EXTENSION)
            )
            .map(([filePath, contents]) => {
              const id = getHighlighterId(filePath);
              return [id, JSON.parse(contents)];
            })
        )
      );
    });
    this.unsubscribes = [
      reaction(
        () => {
          return [...textDocumentsMobx.values()].map((textDocument) => {
            return [
              textDocument.id,
              `${textDocument.name}\n${textDocument.text.toString()}`,
            ];
          });
        },
        async (serializedDocuments) => {
          for (const [id, contents] of serializedDocuments) {
            await this.writeFile(`/${id}.${TEXT_FILE_EXTENSION}`, contents);
          }
        },
        { equals: comparer.structural, delay: 100 }
      ),
      reaction(
        () => {
          return JSON.stringify(
            getDocumentSheetConfig([...textDocumentsMobx.values()])
          );
        },
        async (documentSheetConfigJSON) => {
          await this.writeFile(
            DOCUMENT_SHEET_CONFIG_FILEPATH,
            documentSheetConfigJSON
          );
        },
        { delay: 100 }
      ),
      reaction(
        () => {
          return [...sheetConfigsMobx.values()].map((sheetConfig) => {
            return [sheetConfig.id, JSON.stringify(sheetConfig)];
          });
        },
        async (serializedSheetConfigs) => {
          for (const [id, contents] of serializedSheetConfigs) {
            await this.writeFile(
              `/${id}.${HIGHLIGHTER_FILE_EXTENSION}`,
              contents
            );
          }
        },
        { equals: comparer.structural, delay: 100 }
      ),
    ];
  }

  async writeFile(filePath: string, contents: string) {
    if (this.fileCache[filePath] === contents) {
      return;
    }
    if (
      !filePath.endsWith(`.${HIGHLIGHTER_FILE_EXTENSION}`) &&
      !filePath.endsWith(`.${TEXT_FILE_EXTENSION}`) &&
      filePath !== DOCUMENT_SHEET_CONFIG_FILEPATH
    ) {
      throw new Error();
    }
    if (this.directoryHandle === undefined) {
      throw new Error();
    }
    if (filePath.split("/").length !== 2 && filePath[0] === "/") {
      throw new Error("only files in root directory are supported");
    }
    const fileName = filePath.substring(1);
    let fileHandle = this.fileHandles[filePath];
    if (fileHandle === undefined) {
      fileHandle = await this.directoryHandle.getFileHandle(fileName, {
        create: true,
      });
      this.fileHandles[filePath] = fileHandle;
    }
    await fileSave(
      new Blob([contents], { type: "text/plain" }),
      {},
      fileHandle,
      true
    );
    this.fileCache[filePath] = contents;
  }

  destroy() {
    for (const unsubscribe of this.unsubscribes) {
      unsubscribe();
    }
  }
}

type SerializedDocumentSheet = {
  textDocumentId: string;
  id: string;
  configId: string;
  highlightSearchRange: Span | undefined;
};
function getDocumentSheetConfig(
  textDocuments: TextDocument[]
): SerializedDocumentSheet[] {
  return textDocuments.flatMap((textDocument) =>
    textDocument.sheets.map((documentSheet) => ({
      textDocumentId: textDocument.id,
      id: documentSheet.id,
      configId: documentSheet.configId,
      highlightSearchRange: documentSheet.highlightSearchRange,
    }))
  );
}
