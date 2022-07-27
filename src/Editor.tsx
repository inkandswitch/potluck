import { Decoration, EditorView } from "@codemirror/view";
import { Facet, StateEffect, StateField } from "@codemirror/state";
import { minimalSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { autorun, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import {
  Highlight,
  highlightComponentEntriesMobx,
  hoverHighlightsMobx,
  Span,
  textDocumentsMobx,
  textEditorStateMobx,
} from "./primitives";
import { editorSelectionHighlightsComputed } from "./compute";
import { doSpansOverlap, isValueRowHighlight } from "./utils";

const textDocumentIdFacet = Facet.define<string, string>({
  combine: (values) => values[0],
});

const setHighlightsEffect = StateEffect.define<Highlight[]>();
const highlightsField = StateField.define<Highlight[]>({
  create() {
    return [];
  },
  update(highlights, tr) {
    for (let e of tr.effects) {
      if (e.is(setHighlightsEffect)) {
        return e.value;
      }
    }
    return highlights
      .map(
        (highlight): Highlight => ({
          ...highlight,
          span: [
            tr.changes.mapPos(highlight.span[0]),
            tr.changes.mapPos(highlight.span[1]),
          ],
        })
      )
      .filter((highlight) => highlight.span[0] !== highlight.span[1]);
  },
});

const setHoverHighlightsEffect = StateEffect.define<Highlight[]>();
const hoverHighlightsField = StateField.define<Highlight[]>({
  create() {
    return [];
  },
  update(highlights, tr) {
    for (let e of tr.effects) {
      if (e.is(setHoverHighlightsEffect)) {
        return e.value;
      }
    }
    return highlights
      .map(
        (highlight): Highlight => ({
          ...highlight,
          span: [
            tr.changes.mapPos(highlight.span[0]),
            tr.changes.mapPos(highlight.span[1]),
          ],
        })
      )
      .filter((highlight) => highlight.span[0] !== highlight.span[1]);
  },
});

const highlightDecorations = EditorView.decorations.compute(
  [highlightsField, hoverHighlightsField],
  (state) => {
    const selectionRange = state.selection.asSingle().main;
    const selectionSpan: Span = [selectionRange.from, selectionRange.to];
    const highlights = state.field(highlightsField);
    const selectionHighlights = highlights.filter(
      (highlight) =>
        isValueRowHighlight(highlight) &&
        doSpansOverlap(highlight.span, selectionSpan)
    );
    const hoverHighlights = state.field(hoverHighlightsField);
    return Decoration.set(
      [
        ...selectionHighlights.flatMap((highlight) => {
          return Object.values(highlight.data).flatMap((columnValue) =>
            isValueRowHighlight(columnValue)
              ? [
                  Decoration.mark({
                    class: "cm-highlight-hover",
                  }).range(columnValue.span[0], columnValue.span[1]),
                ]
              : []
          );
        }),
        ...hoverHighlights.map((highlight) => {
          return Decoration.mark({
            class: "cm-highlight-hover",
          }).range(highlight.span[0], highlight.span[1]);
        }),
        ...highlights.map((highlight) => {
          return Decoration.mark({
            class: "cm-highlight",
          }).range(highlight.span[0], highlight.span[1]);
        }),
      ],
      true
    );
  }
);

export const Editor = observer(
  ({ textDocumentId }: { textDocumentId: string }) => {
    const editorRef = useRef(null);
    const textDocument = textDocumentsMobx.get(textDocumentId)!;

    useEffect(() => {
      const view = new EditorView({
        doc: textDocument.text,
        extensions: [
          minimalSetup,
          EditorView.theme({
            "&": {
              height: "100%",
              padding: "4px",
            },
            ".cm-content": {
              fontFamily: `"SF Compact", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";`,
              fontSize: "15px",
              lineHeight: "1.8",
              color: "#555",
            },
          }),
          EditorView.lineWrapping,
          highlightsField,
          highlightDecorations,
          hoverHighlightsField,
          textDocumentIdFacet.of(textDocumentId),
        ],
        parent: editorRef.current!,
        dispatch(transaction) {
          view.update([transaction]);

          runInAction(() => {
            textEditorStateMobx.set(transaction.state);
            if (transaction.docChanged) {
              textDocument.text = view.state.doc;
              for (const sheet of textDocument.sheets) {
                if (sheet.highlightSearchRange !== undefined) {
                  sheet.highlightSearchRange = [
                    transaction.changes.mapPos(sheet.highlightSearchRange[0]),
                    transaction.changes.mapPos(sheet.highlightSearchRange[1]),
                  ];
                }
              }
              for (const componentEntry of highlightComponentEntriesMobx) {
                componentEntry.span = [
                  transaction.changes.mapPos(componentEntry.span[0]),
                  transaction.changes.mapPos(componentEntry.span[1]),
                ];
              }
            }
          });
        },
      });

      runInAction(() => {
        textEditorStateMobx.set(view.state);
      });

      const unsubscribes: (() => void)[] = [
        autorun(() => {
          const highlights = editorSelectionHighlightsComputed.get();
          view.dispatch({
            effects: setHighlightsEffect.of(highlights),
          });
        }),
        autorun(() => {
          view.dispatch({
            effects: setHoverHighlightsEffect.of(hoverHighlightsMobx.toJSON()),
          });
        }),
      ];

      return () => {
        unsubscribes.forEach((unsubscribe) => unsubscribe());
        view.destroy();
      };
    }, [textDocument]);

    return (
      <div className="text-lg h-full bg-white  overflow-auto" ref={editorRef} />
    );
  }
);
