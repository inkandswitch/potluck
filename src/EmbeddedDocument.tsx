import React from "react";
import {useState, useEffect} from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Toast from "@radix-ui/react-toast";
import {observer} from "mobx-react-lite";
import "./index.css";
import classNames from "classnames";
import {MagnifyingGlassIcon} from "@radix-ui/react-icons"
import {ToastViewport} from "@radix-ui/react-toast";
import {selectedTextDocumentIdBox, textDocumentsMobx} from "./primitives";
import {Editor} from "./Editor"
import {loadDocumentExport} from "./App";

const SearchButton = observer(({onClick}: { onClick: () => void }) => {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild={true}>
        <button
          onClick={onClick}
          className="text-gray-600 hover:text-gray-700"
        >
          <MagnifyingGlassIcon/>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="text-xs bg-gray-700 text-white px-2 py-1 rounded">
          ⌘ <span className="text-gray-500">+</span> ⇧{" "}
          <span className="text-gray-500">+</span> F
          <Tooltip.Arrow className="fill-gray-700"/>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
})

export const EmbeddedDocument = observer(({url}: { url: string }) => {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)

    fetch(url)
      .then((res) => res.json())
      .then((documentExport) => {
        loadDocumentExport(documentExport, true)
        setIsLoading(false)
      })

  }, [url])

  if (isLoading) {
    return <div></div>
  }

  const documentId = selectedTextDocumentIdBox.get()

  return (
    <>
      <div
        className={classNames(
          "flex flex-col overflow-hidden flex-shrink-0 border border-gray-200 w-screen h-screen",
          // showSearchPanel ? "w-2/5" : "grow"
        )}
      >
        {false && <div className="flex flex-shrink-0 items-center h-12 border-b border-gray-200 px-4 gap-3">
          <div className="grow"/>
        </div> }

        <Editor textDocumentId={documentId}/>
      </div>
      <ToastViewport className="fixed top-4 right-4 flex flex-col gap-2"/>
    </>
  )
})
