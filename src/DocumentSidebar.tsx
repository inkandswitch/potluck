import classNames from "classnames";
import { action, computed, values } from "mobx";
import { observer } from "mobx-react-lite";
import {
  selectedTextDocumentIdBox,
  showDocumentSidebarBox,
  TextDocument,
  textDocumentsMobx,
} from "./primitives";
import { FileTextIcon } from "@radix-ui/react-icons";

const DocumentSidebarItem = observer(
  ({ textDocument }: { textDocument: TextDocument }) => {
    const firstLineText = computed(
      () => textDocument.text.lineAt(0).text
    ).get();
    const isSelected = computed(
      () => textDocument.id === selectedTextDocumentIdBox.get()
    ).get();

    return (
      <button
        onClick={action(() => {
          selectedTextDocumentIdBox.set(textDocument.id);
        })}
        className={classNames(
          "block w-full text-left border-b border-gray-200 text-sm px-2 py-2",
          isSelected ? "bg-gray-100" : "hover:bg-gray-50"
        )}
      >
        <div className="flex items-center">
          <div className="mr-1">
            <FileTextIcon className="text-gray-400" />
          </div>
          <div className="font-medium">{textDocument.name}</div>
        </div>
        <div className="whitespace-nowrap overflow-hidden overflow-ellipsis text-gray-400 text-xs">
          {firstLineText}
        </div>
      </button>
    );
  }
);

export const DocumentSidebar = observer(() => {
  if (!showDocumentSidebarBox.get()) {
    return null;
  }

  return (
    <div className="w-64 border-r border-gray-200">
      <div className="flex items-center justify-between px-2 h-12 border-b border-gray-200">
        <div className="text-sm font-medium">
          Potluck{" "}
          <span className="bg-blue-200 text-blue-600 rounded px-1 py-0.5 text-xs">
            v0.5
          </span>
        </div>
      </div>
      {values(textDocumentsMobx).map((textDocument) => (
        <DocumentSidebarItem
          textDocument={textDocument}
          key={textDocument.id}
        />
      ))}
    </div>
  );
});
