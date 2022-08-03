import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { Facet, StateEffect, StateField } from "@codemirror/state";
import { minimalSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { autorun, comparer, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import {
  Highlight,
  highlightComponentEntriesMobx,
  hoverHighlightsMobx,
  PropertyVisibility,
  searchResults,
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
  isHighlightComponent,
  isValueRowHighlight,
} from "./utils";
import { createRoot, Root } from "react-dom/client";
import { NumberSliderComponent } from "./NumberSliderComponent";
import classNames from "classnames";

const ANNOTATION_TOKEN_CLASSNAME = "annotation-token";
const MAX_SUPERSCRIPT_LENGTH = 20;

enum SuperscriptWidgetMode {
  Normal,
  InlineWidgetTemporarilyMoved, // We show inline widgets above the text while the user edits inside
}

class SuperscriptWidget extends WidgetType {
  reactRoots: Root[] = [];

  constructor(
    readonly highlightData: { [key: string]: any },
    readonly visibleProperties: string[],
    readonly mode: SuperscriptWidgetMode = SuperscriptWidgetMode.Normal
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    // BIG HACK
    // For number sliders, we can't swap out the DOM element while the user is
    // dragging. Therefore, if any of the highlight data is a slider, we'll
    // reuse the previous widget to keep the same DOM.
    if (
      other instanceof SuperscriptWidget &&
      Object.values(this.highlightData).some(
        (value) => value instanceof NumberSliderComponent
      ) &&
      Object.values(other.highlightData).some(
        (value) => value instanceof NumberSliderComponent
      )
    ) {
      return true;
    }
    return (
      other instanceof SuperscriptWidget &&
      comparer.structural(this.highlightData, other.highlightData) &&
      comparer.structural(this.visibleProperties, other.visibleProperties)
    );
  }

  toDOM() {
    const root = document.createElement("span");
    root.className = "relative";
    const wrap = document.createElement("span");
    root.appendChild(wrap);
    wrap.className =
      "absolute bottom-[calc(100%-7px)] left-0 flex gap-1 whitespace-nowrap text-[11px]";
    wrap.setAttribute("aria-hidden", "true");
    if (this.highlightData === undefined) {
      return wrap;
    }
    for (const key of this.visibleProperties) {
      const value = this.highlightData[key];
      if (value === undefined) {
        continue;
      }
      if (isHighlightComponent(value)) {
        const token = document.createElement("span");
        const reactRoot = createRoot(token);
        this.reactRoots.push(reactRoot);
        reactRoot.render(value.render());
        wrap.appendChild(token);
        continue;
      }
      let valueAsText = isValueRowHighlight(value)
        ? getTextForHighlight(value) ?? ""
        : value;
      if (valueAsText.length > MAX_SUPERSCRIPT_LENGTH) {
        valueAsText = valueAsText.substring(0, MAX_SUPERSCRIPT_LENGTH) + "...";
      }
      const token = document.createElement("span");
      switch (this.mode) {
        case SuperscriptWidgetMode.Normal: {
          token.className = `font-[Schoolbell] text-xs text-[#1355ff]`;
          break;
        }
        case SuperscriptWidgetMode.InlineWidgetTemporarilyMoved: {
          token.className = `${ANNOTATION_TOKEN_CLASSNAME} ml-1 first:ml-0 align-top top-[14px] z-10 relative py-[1px] px-1 rounded-sm whitespace-nowrap transition-all`;
          setTimeout(() => {
            token.style.top = "0px";
            token.style.opacity = "70%";
            token.style.boxShadow = "rgb(100 100 100 / 57%) 0px 0px 5px";
          }, 0);
          break;
        }
      }
      token.innerText = valueAsText;
      token.setAttribute("data-snippet-property-name", key);
      wrap.appendChild(token);
    }
    return root;
  }

  destroy(dom: HTMLElement): void {
    for (const reactRoot of this.reactRoots) {
      reactRoot.unmount();
    }
  }
}

enum InlineWidgetMode {
  Inline,
  Replace,
}

class InlineWidget extends WidgetType {
  reactRoots: Root[] = [];

  constructor(
    readonly highlightData: { [key: string]: any },
    readonly visibleProperties: string[],
    readonly mode: InlineWidgetMode = InlineWidgetMode.Inline
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof SuperscriptWidget &&
      comparer.structural(this.highlightData, other.highlightData) &&
      comparer.structural(this.visibleProperties, other.visibleProperties)
    );
  }

  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = classNames("rounded-r", {
      "ml-1": this.mode === InlineWidgetMode.Inline,
    });
    wrap.setAttribute("aria-hidden", "true");
    if (this.highlightData === undefined) {
      return wrap;
    }
    for (const key of this.visibleProperties) {
      const value = this.highlightData[key];
      if (value === undefined) {
        continue;
      }
      if (isHighlightComponent(value)) {
        const token = document.createElement("span");
        token.className = "mx-1";
        const reactRoot = createRoot(token);
        this.reactRoots.push(reactRoot);
        reactRoot.render(value.render());
        wrap.appendChild(token);
        continue;
      }
      let valueAsText = isValueRowHighlight(value)
        ? getTextForHighlight(value) ?? ""
        : value;
      if (valueAsText.length > MAX_SUPERSCRIPT_LENGTH) {
        valueAsText = valueAsText.substring(0, MAX_SUPERSCRIPT_LENGTH) + "...";
      }
      const token = document.createElement("span");
      token.className = `${ANNOTATION_TOKEN_CLASSNAME} ml-1 first:ml-0 align-top top-[4px] relative py-[1px] px-1 rounded-sm whitespace-nowrap`;
      token.innerText = valueAsText;
      token.setAttribute("data-snippet-property-name", key);
      wrap.appendChild(token);
    }
    return wrap;
  }

  destroy(dom: HTMLElement): void {
    for (const reactRoot of this.reactRoots) {
      reactRoot.unmount();
    }
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
    const documentId = state.facet(textDocumentIdFacet);
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
            isValueRowHighlight(columnValue) &&
            columnValue.documentId === documentId
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
          const decorations = [
            Decoration.mark({
              class: "cm-highlight",
            }).range(highlight.span[0], highlight.span[1]),
          ];
          if (highlight.data !== undefined) {
            const superscriptProperties = sheetConfigsMobx
              .get(highlight.sheetConfigId)!
              .properties.filter(
                (property) =>
                  property.visibility === PropertyVisibility.Superscript
              )
              .map((property) => property.name);
            if (superscriptProperties.length > 0) {
              decorations.push(
                Decoration.widget({
                  widget: new SuperscriptWidget(
                    highlight.data,
                    superscriptProperties
                  ),
                  side: 1,
                }).range(highlight.span[0])
              );
            }
            const inlineProperties = sheetConfigsMobx
              .get(highlight.sheetConfigId)!
              .properties.filter(
                (property) => property.visibility === PropertyVisibility.Inline
              )
              .map((property) => property.name);
            if (inlineProperties.length > 0) {
              decorations.push(
                Decoration.widget({
                  widget: new InlineWidget(highlight.data, inlineProperties),
                  side: 1,
                }).range(highlight.span[1])
              );
            }
            const replaceProperties = sheetConfigsMobx
              .get(highlight.sheetConfigId)!
              .properties.filter(
                (property) => property.visibility === PropertyVisibility.Replace
              )
              .map((property) => property.name);
            if (
              replaceProperties.some(
                (propertyName) => highlight.data[propertyName]
              )
            ) {
              const spansOverlap = doSpansOverlap(
                selectionSpan,
                highlight.span
              );
              if (!spansOverlap) {
                decorations.push(
                  Decoration.mark({
                    class: "cm-highlight-replace",
                  }).range(highlight.span[0], highlight.span[1])
                );
              }
              decorations.push(
                spansOverlap
                  ? Decoration.widget({
                      widget: new SuperscriptWidget(
                        highlight.data,
                        replaceProperties,
                        SuperscriptWidgetMode.InlineWidgetTemporarilyMoved
                      ),
                      side: 1,
                    }).range(highlight.span[0])
                  : Decoration.widget({
                      widget: new InlineWidget(
                        highlight.data,
                        replaceProperties,
                        InlineWidgetMode.Replace
                      ),
                      side: 1,
                    }).range(highlight.span[1])
              );
            }
          }
          return decorations;
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
              fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";`,
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
                if (componentEntry.documentId === textDocumentId) {
                  componentEntry.span = [
                    transaction.changes.mapPos(componentEntry.span[0]),
                    transaction.changes.mapPos(componentEntry.span[1]),
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
          const highlights = hoverHighlightsMobx
            .toJSON()
            .concat(searchResults.get());
          view.dispatch({
            effects: setHoverHighlightsEffect.of(
              highlights.filter((h) => {
                return h.documentId === textDocumentId;
              })
            ),
          });
        }),
      ];

      return () => {
        unsubscribes.forEach((unsubscribe) => unsubscribe());
        view.destroy();
      };
    }, [textDocument]);

    return (
      <div
        className="text-lg max-w-xl h-full bg-white  overflow-auto"
        ref={editorRef}
      />
    );
  }
);
