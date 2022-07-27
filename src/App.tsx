import { Editor } from "./Editor";
import {
  addSheetConfig,
  getSheetConfigsOfTextDocument,
  isSheetExpandedMobx,
  selectedTextDocumentIdBox,
  sheetConfigsMobx,
  TextDocument,
  textDocumentsMobx,
} from "./primitives";
import { observer } from "mobx-react-lite";
import { useRef, useState } from "react";
import { SheetComponent } from "./SheetComponent";
import { action, runInAction } from "mobx";
import { Text } from "@codemirror/state";
import classNames from "classnames";
import { getComputedDocumentValues } from "./compute";
import { generateNanoid } from "./utils";
import { DirectoryPersistence, FileDropWrapper } from "./persistence";
import { FileIcon, FileTextIcon, PauseIcon } from "@radix-ui/react-icons";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ToastViewport } from "@radix-ui/react-toast";

const NEW_OPTION_ID = "new";
const AddNewDocumentSheet = observer(
  ({ textDocument }: { textDocument: TextDocument }) => {
    const sheetConfigSelectRef = useRef<HTMLSelectElement>(null);

    return (
      <form
        onSubmit={action((e) => {
          e.preventDefault();
          let sheetConfigId = sheetConfigSelectRef.current!.value;
          if (sheetConfigId === NEW_OPTION_ID) {
            const sheetConfig = addSheetConfig();
            sheetConfigId = sheetConfig.id;
          }
          const textDocumentSheetId = generateNanoid();
          textDocument.sheets.push({
            id: textDocumentSheetId,
            configId: sheetConfigId,
          });
          sheetConfigSelectRef.current!.value = NEW_OPTION_ID;
          isSheetExpandedMobx.set(textDocumentSheetId, true);
        })}
        className="flex gap-4"
      >
        <select
          className="border border-gray-200 rounded px-1"
          ref={sheetConfigSelectRef}
        >
          <option value={NEW_OPTION_ID}>New highlighter type</option>
          {[...sheetConfigsMobx.values()].map((sheetConfig) => (
            <option value={sheetConfig.id} key={sheetConfig.id}>
              {sheetConfig.name}
            </option>
          ))}
        </select>
        <button type="submit" className="button">
          + Add sheet
        </button>
      </form>
    );
  }
);

const TextDocumentName = observer(
  ({ textDocument }: { textDocument: TextDocument }) => {
    return (
      <div>
        <input
          type="text"
          value={textDocument.name}
          onChange={action((e) => {
            textDocument.name = e.target.value;
          })}
          className="text-md border-b border-gray-100 w-full mb-4 pb-0.5 outline-none focus:border-gray-300"
        />
      </div>
    );
  }
);

const TextDocumentComponent = observer(
  ({ textDocumentId }: { textDocumentId: string }) => {
    const textDocument = textDocumentsMobx.get(textDocumentId)!;

    return (
      <div className="grow flex flex-col overflow-hidden">
        <TextDocumentName textDocument={textDocument} />
        <div className="grow pb-4 overflow-hidden">
          <Editor textDocumentId={textDocumentId} />
        </div>
      </div>
    );
  }
);

const TextDocumentSelector = observer(() => {
  return (
    <div className="pt-4 pb-2">
      <select
        onChange={action((e) => {
          let newDocumentId = e.target.value;
          if (newDocumentId === NEW_OPTION_ID) {
            newDocumentId = generateNanoid();
            textDocumentsMobx.set(newDocumentId, {
              id: newDocumentId,
              name: "Untitled",
              text: Text.empty,
              sheets: [],
            });
          }
          selectedTextDocumentIdBox.set(newDocumentId);
        })}
        value={selectedTextDocumentIdBox.get()}
        className="border border-gray-200 rounded p-1"
      >
        {[...textDocumentsMobx.values()].map((textDocument) => (
          <option value={textDocument.id} key={textDocument.id}>
            {textDocument.name}
          </option>
        ))}
        <option value={NEW_OPTION_ID}>New text document</option>
      </select>
      <button
        className="ml-4 text-gray-400 hover:text-gray-600"
        onClick={() => {
          runInAction(() => {
            const currentDoc = textDocumentsMobx.get(
              selectedTextDocumentIdBox.get()
            )!;
            const newDocumentId = generateNanoid();
            textDocumentsMobx.set(newDocumentId, {
              id: newDocumentId,
              name: `Copy of ${currentDoc.name}`,
              text: Text.empty,
              sheets: currentDoc.sheets.map((sheet) => ({
                ...sheet,
                highlightSearchRange: undefined,
              })),
            });
            selectedTextDocumentIdBox.set(newDocumentId);
          });
        }}
      >
        <span className="text-xl">⎘</span> copy as template
      </button>
    </div>
  );
});

const DocumentSheets = observer(
  ({ textDocumentId }: { textDocumentId: string }) => {
    const textDocument = textDocumentsMobx.get(textDocumentId)!;
    const documentValueRows = getComputedDocumentValues(textDocumentId).get();
    return (
      <>
        <div className="flex flex-col gap-6">
          {textDocument.sheets.map((sheet) => {
            return (
              <SheetComponent
                id={sheet.id}
                textDocument={textDocument}
                sheetConfigId={sheet.configId}
                key={sheet.id}
                rows={documentValueRows[sheet.configId]}
              />
            );
          })}
        </div>
        <div
          className={classNames("mb-8", {
            "mt-8": textDocument.sheets.length > 0,
          })}
        >
          <AddNewDocumentSheet textDocument={textDocument} />
        </div>
      </>
    );
  }
);

const PersistenceButton = observer(() => {
  const [directoryPersistence, setDirectoryPersistence] = useState<
    DirectoryPersistence | undefined
  >(undefined);
  return (
    <div className="absolute top-2 right-2 flex gap-2 bg-white bg-opacity-50 p-2 rounded">
      <Tooltip.Root>
        <Tooltip.Trigger asChild={true}>
          <button
            onClick={() => {
              if (directoryPersistence !== undefined) {
                directoryPersistence.destroy();
              }
              async function go() {
                const d = new DirectoryPersistence();
                await d.init();
                setDirectoryPersistence(d);
              }
              go();
            }}
            className="text-gray-400 hover:text-gray-700"
          >
            {directoryPersistence !== undefined ? (
              <FileTextIcon />
            ) : (
              <FileIcon />
            )}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="text-xs bg-gray-700 text-white px-2 py-1 rounded">
            {directoryPersistence !== undefined
              ? "syncing with filesystem"
              : "sync with filesystem"}
            <Tooltip.Arrow className="fill-gray-700" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      {directoryPersistence !== undefined ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild={true}>
            <button
              onClick={() => {
                if (directoryPersistence !== undefined) {
                  directoryPersistence.destroy();
                }
                setDirectoryPersistence(undefined);
              }}
              className="text-gray-400 hover:text-gray-700"
            >
              <PauseIcon />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="text-xs bg-gray-700 text-white px-2 py-1 rounded">
              stop syncing
              <Tooltip.Arrow className="fill-gray-700" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : null}
    </div>
  );
});

const App = observer(() => {
  const textDocumentId = selectedTextDocumentIdBox.get();
  return (
    <FileDropWrapper className="h-screen flex px-12">
      <div className="w-1/2 max-w-lg flex flex-col flex-shrink-0">
        <TextDocumentSelector />
        <TextDocumentComponent
          textDocumentId={textDocumentId}
          key={textDocumentId}
        />
      </div>
      <div className="grow h-full overflow-auto pl-8 pr-6 pt-24 border-l border-gray-100">
        <DocumentSheets textDocumentId={textDocumentId} />
      </div>
      <PersistenceButton />
      <ToastViewport className="fixed top-4 right-4 flex flex-col gap-2" />
    </FileDropWrapper>
  );
});

export default App;
