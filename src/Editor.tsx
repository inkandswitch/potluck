import {
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { Facet, StateEffect, StateField } from "@codemirror/state";
import { minimalSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { autorun, comparer, computed, reaction, runInAction, toJS } from "mobx";
import { observer } from "mobx-react-lite";
import {
  getSheetConfigsOfTextDocument,
  Highlight,
  hoverHighlightsMobx,
  SheetConfig,
  sheetConfigsMobx,
  textDocumentsMobx,
  textEditorStateMobx,
} from "./primitives";
import { evaluateSheetConfigs } from "./formulas";
import { doesSpanContainOtherSpan, doSpansOverlap } from "./utils";

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
    const hoverHighlights = state.field(hoverHighlightsField);
    return Decoration.set(
      [
        ...hoverHighlights.map((highlight) => {
          return Decoration.mark({
            class: "cm-highlight-hover",
          }).range(highlight.span[0], highlight.span[1]);
        }),
        ...state
          .field(highlightsField)
          .filter(
            (highlight) =>
              !hoverHighlights.some((h) =>
                doesSpanContainOtherSpan(h.span, highlight.span)
              )
          )
          .map((highlight) => {
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
            textDocument.text = view.state.doc;
            textEditorStateMobx.set(transaction.state);
          });
        },
      });

      runInAction(() => {
        textEditorStateMobx.set(view.state);
      });

      const unsubscribes: (() => void)[] = [
        autorun(() => {
          const highlights = computed(
            () => {
              const sheetConfigs: SheetConfig[] =
                getSheetConfigsOfTextDocument(textDocument);
              const documentValueRows = evaluateSheetConfigs(
                textDocument,
                sheetConfigs
              );
              return Object.values(documentValueRows)
                .map((sheetValueRows) =>
                  sheetValueRows.filter(
                    (r): r is Highlight => "span" in r && r.span !== undefined
                  )
                )
                .flat();
            },
            { equals: comparer.structural }
          ).get();
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
    }, [textDocumentId]);

    return (
      <div
        className="text-lg h-[800px] w-[600px] bg-white border-black border-2 rounded-lg overflow-auto flex-shrink-0"
        ref={editorRef}
      />
    );
  }
);
