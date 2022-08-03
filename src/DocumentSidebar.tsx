import classNames from "classnames";
import { action, computed, values } from "mobx";
import { observer } from "mobx-react-lite";
import {
  selectedTextDocumentIdBox,
  showDocumentSidebarBox,
  TextDocument,
  textDocumentsMobx,
} from "./primitives";
import { useState } from "react";
import { FileTextIcon } from "@radix-ui/react-icons";
import { DirectoryPersistence } from "./persistence";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  CheckCircledIcon,
  CircleBackslashIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";

const PersistenceButton = observer(() => {
  const [directoryPersistence, setDirectoryPersistence] = useState<
    DirectoryPersistence | undefined
  >(undefined);
  return (
    <div className="flex gap-2 bg-white bg-opacity-50 p-2 rounded">
      <Tooltip.Root>
        <Tooltip.Trigger asChild={true}>
          <button
            onClick={(e) => {
              if (directoryPersistence !== undefined) {
                directoryPersistence.destroy();
              }

              const isMetaKey = e.metaKey;
              async function go() {
                const d = new DirectoryPersistence();
                await d.init(isMetaKey);
                setDirectoryPersistence(d);
              }

              go();
            }}
            className="text-gray-600 hover:text-gray-700"
          >
            {directoryPersistence !== undefined ? (
              <CheckCircledIcon className="text-green-500" />
            ) : (
              <UpdateIcon />
            )}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="text-xs bg-gray-700 text-white px-2 py-1 rounded">
            {directoryPersistence !== undefined
              ? "Syncing with filesystem"
              : "Sync with filesystem"}
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
              <CircleBackslashIcon />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="text-xs bg-gray-700 text-white px-2 py-1 rounded">
              Stop syncing
              <Tooltip.Arrow className="fill-gray-700" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : null}
    </div>
  );
});

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

        <PersistenceButton />
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
