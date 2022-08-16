import { Text } from "@codemirror/state";
import { fileSave } from "browser-fs-access";
import { comparer, observable, reaction, runInAction } from "mobx";
import {
  selectedTextDocumentIdBox,
  SheetConfig,
  sheetConfigsMobx,
  Span,
  TextDocument,
  TextDocumentSheet,
  textDocumentsMobx,
} from "./primitives";
import React, { useState } from "react";
import { generateNanoid } from "./utils";
import * as Toast from "@radix-ui/react-toast";
import { get, set } from "idb-keyval";

function prettyStringify(value: any): string {
  return JSON.stringify(value, null, 2);
}

const IDB_DIRECTORY_HANDLE_KEY = "directoryHandle";

// we'll always start file paths with / so "/foo.txt" is a foo.txt in the root
// directory.

export const TEXT_FILE_EXTENSION = "txt";
export const DOCUMENT_METADATA_EXTENSION = "metadata";
export const HIGHLIGHTER_FILE_EXTENSION = "highlighter";

export const directoryPersistenceBox = observable.box<
  DirectoryPersistence | undefined
>(undefined, { deep: false });
export const existingDirectoryHandleBox = observable.box<
  FileSystemDirectoryHandle | undefined
>(undefined);

let lastSelectedSyncDocumentId =
  localStorage.getItem("lastSyncDocumentId") ?? undefined;
reaction(
  () =>
    directoryPersistenceBox.get() !== undefined
      ? selectedTextDocumentIdBox.get()
      : undefined,
  (selectedTextDocumentId) => {
    if (selectedTextDocumentId !== undefined) {
      localStorage.setItem("lastSyncDocumentId", selectedTextDocumentId);
      lastSelectedSyncDocumentId = selectedTextDocumentId;
    }
  }
);

async function init() {
  const existingDirectoryHandle = await get(IDB_DIRECTORY_HANDLE_KEY);
  if (existingDirectoryHandle !== undefined) {
    const permission = await existingDirectoryHandle.queryPermission({
      mode: "readwrite",
    });
    if (permission === "prompt" || permission === "granted") {
      runInAction(() => {
        existingDirectoryHandleBox.set(existingDirectoryHandle);
      });
    }
  }
}
init();

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

function getTextDocumentIdFromMetadata(filePath: string) {
  return filePath.substring(
    1,
    filePath.length - DOCUMENT_METADATA_EXTENSION.length - 1
  );
}

function getHighlighterId(filePath: string) {
  return filePath.substring(
    1,
    filePath.length - HIGHLIGHTER_FILE_EXTENSION.length - 1
  );
}

declare global {
  interface Window {
    showDirectoryPicker(options: any): Promise<any>;
  }
}

export class DirectoryPersistence {
  directoryHandle: FileSystemDirectoryHandle | undefined;
  fileHandles: { [filePath: string]: FileSystemFileHandle } = {};
  fileCache: { [filePath: string]: string } = {};
  unsubscribes: (() => void)[] = [];

  constructor() {}

  async init(
    writePrimitives: boolean,
    directoryHandle?: FileSystemDirectoryHandle
  ) {
    if (directoryHandle !== undefined) {
      // const perm = await lastDirectoryHandle.queryPermission({
      //   mode: "readwrite",
      // });
      // if (perm !== "granted") {
      //   const perm = await lastDirectoryHandle.requestPermission({
      //     mode: "readwrite",
      //   });
      // }
      this.directoryHandle = directoryHandle;
    } else {
      this.directoryHandle = await window.showDirectoryPicker({
        mode: "readwrite",
      });
      set(IDB_DIRECTORY_HANDLE_KEY, this.directoryHandle);
    }
    // @ts-ignore
    for await (const entry of this.directoryHandle.values()) {
      const relativePath = `/${entry.name}`;
      if (entry.kind === "file") {
        const file = await entry.getFile().then((file: any) => {
          file.directoryHandle = this.directoryHandle;
          file.handle = entry;
          return Object.defineProperty(file, "webkitRelativePath", {
            configurable: true,
            enumerable: true,
            get: () => relativePath,
          });
        });
        if (
          file.name.endsWith(`.${HIGHLIGHTER_FILE_EXTENSION}`) ||
          file.name.endsWith(`.${TEXT_FILE_EXTENSION}`) ||
          file.name.endsWith(`.${DOCUMENT_METADATA_EXTENSION}`)
        ) {
          if (file.handle !== undefined) {
            this.fileHandles[relativePath] = file.handle;
          }
          this.fileCache[relativePath] = await file.text();
        }
      }
    }

    await this.initSync(writePrimitives);
    runInAction(() => {
      directoryPersistenceBox.set(this);
    });
  }

  async initSync(writePrimitives: boolean) {
    if (!writePrimitives) {
      runInAction(() => {
        const { textDocuments, sheetConfigs } = getStateFromFiles(
          this.fileCache
        );
        textDocumentsMobx.replace(
          new Map(
            textDocuments.map((textDocument) => [textDocument.id, textDocument])
          )
        );
        sheetConfigsMobx.replace(
          new Map(
            sheetConfigs.map((sheetConfig) => [sheetConfig.id, sheetConfig])
          )
        );
        const textDocumentIds = textDocuments.map((d) => d.id);
        if (
          lastSelectedSyncDocumentId !== undefined &&
          textDocumentIds.includes(lastSelectedSyncDocumentId)
        ) {
          selectedTextDocumentIdBox.set(lastSelectedSyncDocumentId);
        } else if (!textDocumentIds.includes(selectedTextDocumentIdBox.get())) {
          selectedTextDocumentIdBox.set(textDocumentIds[0]);
        }
      });
    }
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
        {
          equals: comparer.structural,
          delay: 100,
          fireImmediately: writePrimitives,
        }
      ),
      reaction(
        () =>
          [...textDocumentsMobx.values()].map((textDocument) => [
            textDocument.id,
            prettyStringify({ sheets: getDocumentSheetConfig(textDocument) }),
          ]),
        async (documentSheetConfig) => {
          for (const [id, contents] of documentSheetConfig) {
            await this.writeFile(
              `/${id}.${DOCUMENT_METADATA_EXTENSION}`,
              contents
            );
          }
        },
        {
          equals: comparer.structural,
          delay: 100,
          fireImmediately: writePrimitives,
        }
      ),
      reaction(
        () => {
          return [...sheetConfigsMobx.values()].map((sheetConfig) => {
            return [sheetConfig.id, prettyStringify(sheetConfig)];
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
        {
          equals: comparer.structural,
          delay: 100,
          fireImmediately: writePrimitives,
        }
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
      !filePath.endsWith(`.${DOCUMENT_METADATA_EXTENSION}`)
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
    runInAction(() => {
      directoryPersistenceBox.set(undefined);
    });
  }
}

export function FileDropWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  const [toastMessage, setToastMessage] = useState<
    [newDocumentNames: string[], newSheetConfigNames: string[]] | undefined
  >(undefined);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={async (e) => {
        e.preventDefault();
        const newTextDocumentNames: string[] = [];
        const newSheetConfigNames: string[] = [];
        for (const file of e.dataTransfer.files) {
          if (file.name.endsWith(TEXT_FILE_EXTENSION)) {
            const fileText = await file.text();
            const lines = fileText.split("\n");
            runInAction(() => {
              const id = generateNanoid();
              textDocumentsMobx.set(id, {
                id,
                name: lines[0],
                text: Text.of(lines.slice(1)),
                sheets: [],
              });
            });
            newTextDocumentNames.push(lines[0]);
          } else if (file.name.endsWith(HIGHLIGHTER_FILE_EXTENSION)) {
            const fileText = await file.text();
            const id = generateNanoid();
            const sheetConfig = { ...JSON.parse(fileText), id };
            runInAction(() => {
              sheetConfigsMobx.set(id, sheetConfig);
            });
            newSheetConfigNames.push(sheetConfig.name);
          }
          if (
            newTextDocumentNames.length > 0 ||
            newSheetConfigNames.length > 0
          ) {
            setToastMessage([newTextDocumentNames, newSheetConfigNames]);
          }
        }
      }}
      className={className}
    >
      {children}
      {toastMessage !== undefined ? (
        <Toast.Root
          duration={3000}
          onOpenChange={(open) => {
            if (!open) {
              setToastMessage(undefined);
            }
          }}
          className="w-80 text-sm bg-white border border-gray-200 p-4 rounded shadow-lg z-1"
        >
          <Toast.Title className="font-semibold pb-2">Files added!</Toast.Title>
          <Toast.Description className="whitespace-pre-wrap">
            {toastMessage[0].length > 0 ? (
              <span>
                {toastMessage[0].join(", ")} added as text documents.{" "}
              </span>
            ) : null}
            {toastMessage[1].length > 0 ? (
              <span>{toastMessage[1].join(", ")} added as sheet configs.</span>
            ) : null}
          </Toast.Description>
        </Toast.Root>
      ) : null}
    </div>
  );
}

type SerializedDocumentSheet = {
  id: string;
  configId: string;
  highlightSearchRange: Span | undefined;
};
function getDocumentSheetConfig(
  textDocument: TextDocument
): SerializedDocumentSheet[] {
  return textDocument.sheets.map((documentSheet) => ({
    id: documentSheet.id,
    configId: documentSheet.configId,
    highlightSearchRange: documentSheet.highlightSearchRange,
  }));
}

export function getStateFromFiles(files: { [filePath: string]: string }): {
  textDocuments: TextDocument[];
  sheetConfigs: SheetConfig[];
} {
  const sheetConfigs = Object.entries(files)
    .filter(([filePath]) => filePath.endsWith(HIGHLIGHTER_FILE_EXTENSION))
    .map(([filePath, contents]) => {
      const id = getHighlighterId(filePath);
      return JSON.parse(contents);
    });
  const documentSheets: {
    [textDocumentId: string]: { sheets: TextDocumentSheet[] };
  } = Object.fromEntries(
    Object.entries(files)
      .filter(([filePath]) => filePath.endsWith(DOCUMENT_METADATA_EXTENSION))
      .map(([filePath, contents]) => {
        const id = getTextDocumentIdFromMetadata(filePath);
        return [id, JSON.parse(contents)];
      })
  );
  const textDocuments = Object.entries(files)
    .filter(([filePath]) => filePath.endsWith(TEXT_FILE_EXTENSION))
    .map(([filePath, contents]) => {
      const id = getTextDocumentId(filePath);
      const lines = contents.split("\n");
      const text = Text.of(
        lines.length > 1 ? contents.split("\n").slice(1) : [""]
      );
      return {
        id,
        name: lines[0] ?? "",
        text,
        sheets: (documentSheets[id]?.sheets ?? [])
          .filter((c) =>
            sheetConfigs.some((config) => config.id === c.configId)
          )
          .map((c) => ({
            id: c.id,
            configId: c.configId,
            highlightSearchRange: c.highlightSearchRange,
          })),
      };
    });
  return { textDocuments, sheetConfigs };
}
