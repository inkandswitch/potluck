import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import {
  EditorState,
  Facet,
  Range,
  SelectionRange,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { minimalSetup } from "codemirror";
import React, { useEffect, useRef } from "react";
import { autorun, comparer, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import {
  addSheetConfig,
  highlightComponentEntriesMobx,
  hoverHighlightsMobx,
  isSheetExpandedMobx,
  PropertyVisibility,
  searchResults,
  sheetConfigsMobx,
  Span,
  textDocumentsMobx,
  textEditorStateMobx,
  textEditorViewMobx,
} from "./primitives";
import { Highlight } from "./highlight";
import { editorSelectionHighlightsComputed } from "./compute";
import {
  doSpansOverlap,
  generateNanoid,
  getTextForHighlight,
  isHighlightComponent,
  isValueRowHighlight,
} from "./utils";
import { createRoot, Root } from "react-dom/client";
import { NumberSliderComponent } from "./NumberSliderComponent";
import { TimerComponent } from "./TimerComponent";
import classNames from "classnames";
import { Pattern, PatternPart, patternToString } from "./patterns";
import { orderBy } from "lodash";

const ANNOTATION_TOKEN_CLASSNAME = "annotation-token";

// Max char length of an annotation. Currently set to an absurdly high value to effectively not limit;
// but I left it in as a constant to make it easy to change later if needed.
const MAX_SUPERSCRIPT_LENGTH = 10000;

enum SuperscriptWidgetMode {
  Normal,
  InlineWidgetTemporarilyMoved, // We show inline widgets above the text while the user edits inside
}

function hasReactComponentWidget(
  highlightData: { [key: string]: any },
  visibleProperties: string[]
) {
  return visibleProperties.some(
    (property) =>
      highlightData[property] instanceof TimerComponent ||
      highlightData[property] instanceof NumberSliderComponent
  );
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
      hasReactComponentWidget(this.highlightData, this.visibleProperties) &&
      hasReactComponentWidget(other.highlightData, other.visibleProperties)
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
    // BIG HACK
    // For timer, we don't want to keep swapping out the DOM to avoid flickers.
    if (
      other instanceof InlineWidget &&
      hasReactComponentWidget(this.highlightData, this.visibleProperties) &&
      hasReactComponentWidget(other.highlightData, other.visibleProperties)
    ) {
      return true;
    }
    return (
      other instanceof InlineWidget &&
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
        token.innerHTML = `<span class="invisible">dummy</span>`;
        const reactRoot = createRoot(token);
        this.reactRoots.push(reactRoot);
        reactRoot.render(value.render());
        wrap.appendChild(token);
        continue;
      }
      if (React.isValidElement(value)) {
        const token = document.createElement("span");
        token.className = "mx-1";
        token.innerHTML = `<span class="invisible">dummy</span>`;
        const reactRoot = createRoot(token);
        this.reactRoots.push(reactRoot);
        reactRoot.render(value);
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
        (highlight): Highlight =>
          Highlight.from({
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
        (highlight): Highlight =>
          Highlight.from({
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

function getHiddenSheetConfigIdsByDocumentId(documentId: string): {
  [sheetId: string]: boolean;
} {
  const isConfigSheetIdHidden: { [sheetId: string]: boolean } = {};
  const textDocument = textDocumentsMobx.get(documentId);

  if (!textDocument) {
    return isConfigSheetIdHidden;
  }

  textDocument.sheets.forEach((sheet) => {
    if (sheet.hideHighlightsInDocument) {
      isConfigSheetIdHidden[sheet.configId] = true;
    }
  });

  return isConfigSheetIdHidden;
}

const highlightDecorations = EditorView.decorations.compute(
  [highlightsField, hoverHighlightsField],
  (state) => {
    const highlights = state.field(highlightsField);
    const documentId = state.facet(textDocumentIdFacet);
    const isConfigSheetIdHidden =
      getHiddenSheetConfigIdsByDocumentId(documentId);

    const selectionRange = state.selection.asSingle().main;
    const selectionSpan: Span = [selectionRange.from, selectionRange.to];
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
            !isConfigSheetIdHidden[columnValue.sheetConfigId] &&
            columnValue.documentId === documentId
              ? [
                  Decoration.mark({
                    class: "cm-highlight-selection",
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
          const decorations: Array<Range<Decoration>> = [];

          // We apply style properties even if the sheet config is set to not show highlights in doc,
          // eg so that we can apply markdown styling without blue underlines everywhere.
          const styleProperties = sheetConfigsMobx
            .get(highlight.sheetConfigId)!
            .properties.filter(
              (property) => property.visibility === PropertyVisibility.Style
            )
            .map((property) => property.name);
          if (styleProperties.length > 0) {
            decorations.push(
              Decoration.mark({
                attributes: {
                  style: styleProperties
                    .map((property) => {
                      return `${property}: ${highlight.data[property]}`;
                    })
                    .join("; "),
                },
              }).range(highlight.span[0], highlight.span[1])
            );
          }

          if (isConfigSheetIdHidden[highlight.sheetConfigId]) {
            return decorations;
          }

          decorations.push(
            Decoration.mark({
              class: "cm-highlight",
            }).range(highlight.span[0], highlight.span[1])
          );

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

const extractPatternFromHighlightPlugin = ViewPlugin.fromClass(class {}, {
  eventHandlers: {
    keydown(event, view) {
      if (event.key === "h" && event.metaKey) {
        event.preventDefault();

        const pattern = patternFromSelection(view.state);
        if (pattern === undefined) {
          return;
        }
        const textDocumentId = view.state.facet(textDocumentIdFacet);
        const textDocument = textDocumentsMobx.get(textDocumentId);

        if (!textDocument) {
          return;
        }

        runInAction(() => {
          const newSheetConfig = addSheetConfig({
            properties: [
              {
                name: "$",
                formula: patternToString(pattern),
                visibility: PropertyVisibility.Hidden,
              },
            ],
          });

          const sheetId = generateNanoid();

          textDocument.sheets.push({
            id: sheetId,
            configId: newSheetConfig.id,
          });

          isSheetExpandedMobx.set(sheetId, true);
        });
      }
    },
  },
});

export function patternFromSelection(state: EditorState): Pattern | undefined {
  const range = state.selection.ranges[0];
  if (!range) {
    return undefined;
  }
  const highlights = state.field(highlightsField);

  const containedHighlights = orderBy(
    highlights.filter(
      ({ span }) => span[0] >= range.from && span[1] <= range.to
    ),
    ["span.0", "span.1"],
    ["asc", "desc"]
  );

  let patternParts: PatternPart[] = [];
  let prevEnd = range.from;

  const usedHighlightNames: string[] = [];
  for (const highlight of containedHighlights) {
    if (highlight.span[0] < prevEnd) {
      continue;
    }

    if (highlight.span[0] !== prevEnd) {
      patternParts.push({
        type: "text",
        text: state.doc.sliceString(prevEnd, highlight.span[0]),
      });
    }

    prevEnd = highlight.span[1];

    const sheetConfigName = sheetConfigsMobx.get(highlight.sheetConfigId)!.name;

    patternParts.push({
      name: `${sheetConfigName}${
        usedHighlightNames.includes(sheetConfigName)
          ? usedHighlightNames.filter((x) => x === sheetConfigName).length + 1
          : ""
      }`,
      type: "group",
      expr: {
        type: "highlightName",
        name: highlight.data.type
          ? `${sheetConfigName}.${highlight.data.type.valueOf()}`
          : sheetConfigName,
      },
      matchMultiple: false,
    });
    usedHighlightNames.push(sheetConfigName);
  }

  if (prevEnd !== range.to) {
    patternParts.push({
      type: "text",
      text: state.doc.sliceString(prevEnd, range.to),
    });
  }

  return {
    parts: patternParts,
    matchAtStartOfLine: false,
    matchAtEndOfLine: false,
  };
}

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
          extractPatternFromHighlightPlugin,
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

      textEditorViewMobx.set(view);

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
        textEditorViewMobx.set(undefined);
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
