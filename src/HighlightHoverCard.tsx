import { observer } from "mobx-react-lite";
import { useState } from "react";
import { Highlight, textDocumentsMobx } from "./primitives";
import { getTextForHighlight } from "./utils";

export const HighlightHoverCardContent = observer(
  ({ highlight }: { highlight: Highlight }) => {
    const [extraLinesToShow, setExtraLinesToShow] = useState(3);
    const textDocument = textDocumentsMobx.get(highlight.documentId);
    if (textDocument === undefined) {
      return null;
    }
    const highlightLineNumber = textDocument.text.lineAt(
      highlight.span[1]
    ).number;
    const extraContextText = textDocument.text.sliceString(
      highlight.span[1],
      textDocument.text.line(
        Math.min(
          highlightLineNumber + extraLinesToShow,
          textDocument.text.lines
        )
      ).to
    );
    return (
      <>
        <div className="text-xs uppercase font-mono text-gray-400 mb-1">
          {highlight.documentId}[{highlight.span[0]}-{highlight.span[1]}]
        </div>
        <div className="whitespace-pre-wrap">
          <span className="bg-yellow-100">
            {getTextForHighlight(highlight)}
          </span>
          {extraContextText.length > 0 ? <span>{extraContextText}</span> : null}
        </div>
        <div>
          {highlightLineNumber + extraLinesToShow < textDocument.text.lines ? (
            <button
              onClick={() => {
                setExtraLinesToShow((lines) => lines + 3);
              }}
              className="text-gray-300 hover:text-gray-500 transition"
            >
              ...
            </button>
          ) : null}
        </div>
      </>
    );
  }
);
