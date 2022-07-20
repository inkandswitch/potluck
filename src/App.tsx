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
import { nanoid } from "nanoid";
import { SheetComponent } from "./SheetComponent";
import { action, runInAction } from "mobx";
import { Text } from "@codemirror/state";
import classNames from "classnames";
import { getComputedDocumentValues } from "./compute";

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
          const textDocumentSheetId = nanoid();
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
          <option value={NEW_OPTION_ID}>new sheet config</option>
          {[...sheetConfigsMobx.values()].map((sheetConfig) => (
            <option value={sheetConfig.id} key={sheetConfig.id}>
              {sheetConfig.name}
            </option>
          ))}
        </select>
        <button type="submit" className="button">
          add sheet
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
          className="text-xl border-b border-gray-200 w-full mb-4 pb-1 outline-none focus:border-gray-400"
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
            newDocumentId = nanoid();
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
            const newDocumentId = nanoid();
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

const App = observer(() => {
  const textDocumentId = selectedTextDocumentIdBox.get();
  return (
    <div className="h-screen flex pl-4">
      <div className="w-1/2 max-w-lg flex flex-col">
        <TextDocumentSelector />
        <TextDocumentComponent
          textDocumentId={textDocumentId}
          key={textDocumentId}
        />
      </div>
      <div className="grow h-full overflow-auto pl-8 pr-6 pt-24">
        <DocumentSheets textDocumentId={textDocumentId} />
      </div>
    </div>
  );
});

export default App;
