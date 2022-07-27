import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { Facet, StateEffect, StateField } from "@codemirror/state";
import { minimalSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { autorun, comparer, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import {
  Highlight,
  hoverHighlightsMobx,
  PropertyVisibility,
  sheetConfigsMobx,
  Span,
  textDocumentsMobx,
  textEditorStateMobx,
} from "./primitives";
import {
  editorSelectionHighlightsComputed,
  getComputedSheetValue,
} from "./compute";
import {
  doSpansOverlap,
  getTextForHighlight,
  isValueRowHighlight,
} from "./utils";

const ANNOTATION_TOKEN_CLASSNAME = "annotation-token";
const MAX_SUPERSCRIPT_LENGTH = 20;
class HighlightDataWidget extends WidgetType {
  constructor(
    readonly highlightData: { [key: string]: string },
    readonly visibleProperties: string[]
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof HighlightDataWidget &&
      comparer.structural(this.highlightData, other.highlightData) &&
      comparer.structural(this.visibleProperties, other.visibleProperties)
    );
  }

  toDOM() {
    const root = document.createElement("span");
    root.className = "relative";
    const wrap = document.createElement("span");
    root.appendChild(wrap);
    wrap.className = "absolute bottom-full left-0 flex gap-1";
    wrap.setAttribute("aria-hidden", "true");
    if (this.highlightData === undefined) {
      return wrap;
    }
    for (const key of this.visibleProperties) {
      const value = this.highlightData[key];
      if (value === undefined) {
        continue;
      }
      let valueAsText = isValueRowHighlight(value)
        ? getTextForHighlight(value) ?? ""
        : value;
      if (valueAsText.length > MAX_SUPERSCRIPT_LENGTH) {
        valueAsText = valueAsText.substring(0, MAX_SUPERSCRIPT_LENGTH) + "...";
      }
      const token = document.createElement("span");
      token.className = `${ANNOTATION_TOKEN_CLASSNAME} text-[#3a82f5] text-[11px] leading-[8px] whitespace-nowrap relative top-0.5`;
      token.innerText = valueAsText;
      token.setAttribute("data-snippet-property-name", key);
      wrap.appendChild(token);
    }
    return root;
  }

  ignoreEvent(event: Event): boolean {
    return false;
  }
}

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
        ...highlights.flatMap((highlight) => {
          return [
            Decoration.mark({
              class: "cm-highlight",
            }).range(highlight.span[0], highlight.span[1]),
            Decoration.widget({
              widget: new HighlightDataWidget(
                highlight.data,
                sheetConfigsMobx
                  .get(highlight.sheetConfigId)!
                  .properties.filter(
                    (property) =>
                      property.visibility === PropertyVisibility.Superscript
                  )
                  .map((property) => property.name)
              ),
              side: 1,
            }).range(highlight.span[0]),
          ];
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
