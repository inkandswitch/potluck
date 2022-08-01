import { observer } from "mobx-react-lite";
import { useState } from "react";
import { Highlight, textDocumentsMobx } from "./primitives";
import { getTextForHighlight } from "./utils";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

export const HighlightHoverCardContent = observer(
  ({ highlight }: { highlight: Highlight }) => {
    const [extraLinesToShow, setExtraLinesToShow] = useState(3);
    const textDocument = textDocumentsMobx.get(highlight.documentId);
    if (textDocument === undefined) {
      return null;
    }
    const highlightLineStart = textDocument.text.lineAt(
      highlight.span[0]
    ).number;
    const startPosOfHighlightLine =
      textDocument.text.line(highlightLineStart).from;
    const highlightLineEnd = textDocument.text.lineAt(highlight.span[1]).number;
    const extraContextText = textDocument.text.sliceString(
      highlight.span[1],
      textDocument.text.line(
        Math.min(highlightLineEnd + extraLinesToShow, textDocument.text.lines)
      ).to
    );
    return (
      <>
        <div className="text-xs uppercase font-mono text-gray-400 mb-1">
          {highlight.documentId}[{highlight.span[0]}-{highlight.span[1]}]
        </div>
        <div className="whitespace-pre-wrap">
          {highlight.span[0] > startPosOfHighlightLine ? (
            <span>
              {textDocument.text.sliceString(
                startPosOfHighlightLine,
                highlight.span[0]
              )}
            </span>
          ) : null}
          <span className="border-b-2 border-gray-300 py-[1px] bg-yellow-200">
            {getTextForHighlight(highlight)}
          </span>
          {extraContextText.length > 0 ? <span>{extraContextText}</span> : null}
        </div>
        <div>
          {highlightLineEnd + extraLinesToShow < textDocument.text.lines ? (
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

export function HighlightHoverCard({
  children,
  highlight,
}: {
  children: React.ReactNode;
  highlight: Highlight;
}) {
  return (
    <HoverCardPrimitive.Root openDelay={500}>
      <HoverCardPrimitive.Trigger asChild={true}>
        {children}
      </HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Content
        side="top"
        sideOffset={2}
        className="bg-white font-serif p-4 rounded-lg shadow-lg"
      >
        <HoverCardPrimitive.Arrow className="fill-white" />
        <HighlightHoverCardContent highlight={highlight} />
      </HoverCardPrimitive.Content>
    </HoverCardPrimitive.Root>
  );
}
