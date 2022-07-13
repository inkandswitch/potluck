import {useEffect, useRef, useState} from "react";
import {Editor, EDITOR_VIEW, snippetsField} from "./Editor";
import {EditorView} from "@codemirror/view";
import {snippetsMobx, Span} from "./primitives";
import {runInAction} from "mobx";
import {nanoid} from "nanoid";



function getMatchingSelectionSpan (value: string) : Span | undefined  {

  const doc = EDITOR_VIEW.state.doc

  for (const {from, to } of EDITOR_VIEW.state.selection.ranges) {
    const rangeText = doc.sliceString(from, to)

    if (rangeText === value) {
      return [from, to]
    }
  }
}


function Table () {



  const onDragOver = (evt: any) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "move";
  }


  const onDrop = (evt: any) => {
    const value = evt.dataTransfer.getData("text/plain")
    const span = getMatchingSelectionSpan(value)

    console.log('drop', value, span)

    if (!span) {
      return
    }

    runInAction(() => {
      const id = nanoid()
      snippetsMobx.set(id, { id, span })
    })
  }


  return (
    <div onDrop={onDrop} onDragOver={onDragOver}>drag here</div>
  )
}


function App() {
  return (
    <div className="flex p-4 gap-4 items-start">
     <Editor/>
      <Table/>
    </div>
  )
}

export default App
