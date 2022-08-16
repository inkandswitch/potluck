import classNames from "classnames";
import { action, computed, runInAction, values } from "mobx";
import { observer } from "mobx-react-lite";
import {
  selectedTextDocumentIdBox,
  showDocumentSidebarBox,
  TextDocument,
  textDocumentsMobx,
} from "./primitives";
import { useState } from "react";
import { FileTextIcon } from "@radix-ui/react-icons";
import {
  DirectoryPersistence,
  directoryPersistenceBox,
  existingDirectoryHandleBox,
} from "./persistence";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  CheckCircledIcon,
  CircleBackslashIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";

const SyncExistingDirectoryButton = observer(() => {
  const existingDirectoryHandle = existingDirectoryHandleBox.get();
  if (existingDirectoryHandle === undefined) {
    return null;
  }

  return (
    <button
      onClick={async () => {
        const permission = await (
          existingDirectoryHandle as any
        ).queryPermission({
          mode: "readwrite",
        });
        if (permission === "prompt") {
          const requestedPermission = await (
            existingDirectoryHandle as any
          ).requestPermission({
            mode: "readwrite",
          });
          if (requestedPermission !== "granted") {
            runInAction(() => {
              existingDirectoryHandleBox.set(undefined);
            });
            return;
          }
        }
        const d = new DirectoryPersistence();
        d.init(false, existingDirectoryHandle);
      }}
      className="text-[10px] bg-blue-50 px-1 py-0.5 rounded-sm text-blue-500 hover:bg-blue-100 transition"
    >
      sync /{existingDirectoryHandle.name}
    </button>
  );
});

export const PersistenceButton = observer(() => {
  const directoryPersistence = directoryPersistenceBox.get();
  return (
    <>
      <Tooltip.Root>
        <Tooltip.Trigger asChild={true}>
          <button
            onClick={(e) => {
              if (directoryPersistence !== undefined) {
                directoryPersistence.destroy();
              }

              const isMetaKey = e.metaKey;
              const d = new DirectoryPersistence();
              d.init(isMetaKey);
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
      ) : (
        <SyncExistingDirectoryButton />
      )}
    </>
  );
});

const DocumentSidebarItem = observer(
  ({ textDocument }: { textDocument: TextDocument }) => {
    const firstLineText = computed(
      () => {
        let firstNonEmptyLine = ""
        const lines = textDocument.text.iterLines()
        for (const line of lines) {
          if (line.length > 0) {
            firstNonEmptyLine = line
            break
          }
        }
        return firstNonEmptyLine
      }
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

const SORT_FIRST_PREFIX = "Example: ";
export const DocumentSidebar = observer(() => {
  if (!showDocumentSidebarBox.get()) {
    return null;
  }

  const sortedDocuments = [...textDocumentsMobx.values()];
  sortedDocuments.sort((a, b) => {
    if (a.name.startsWith(SORT_FIRST_PREFIX)) {
      if (b.name.startsWith(SORT_FIRST_PREFIX)) {
        return a.name.localeCompare(b.name);
      }
      return -1;
    }
    if (b.name.startsWith(SORT_FIRST_PREFIX)) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="w-64 border-r border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
      <div className="flex-shrink-0 flex items-center justify-between px-2 h-12 border-b border-gray-200">
        <div className="text-sm font-medium">
          Potluck{" "}
          <span className="bg-blue-200 text-blue-600 rounded px-1 py-0.5 text-xs">
            v0.5
          </span>
        </div>
      </div>
      <div className="grow overflow-auto">
        {sortedDocuments.map((textDocument) => (
          <DocumentSidebarItem
            textDocument={textDocument}
            key={textDocument.id}
          />
        ))}
      </div>
    </div>
  );
});
