import React from "react";
import {useState, useEffect} from "react";
import {observer} from "mobx-react-lite";
import "./index.css";
import classNames from "classnames";
import {ToastViewport} from "@radix-ui/react-toast";
import {selectedTextDocumentIdBox} from "./primitives";
import {Editor} from "./Editor"
import {loadDocumentExport} from "./App";

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
          "flex flex-col overflow-hidden flex-shrink-0 w-screen h-screen",
          // showSearchPanel ? "w-2/5" : "grow"
        )}
      >
        <Editor textDocumentId={documentId}/>
      </div>
      <ToastViewport className="fixed top-4 right-4 flex flex-col gap-2"/>
    </>
  )
})
