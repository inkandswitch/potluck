import { computed, observable, runInAction } from "mobx";
import { EditorState, Text } from "@codemirror/state";
import { nanoid } from "nanoid";
import { FormulaColumn } from "./formulas";
import { ALL_INGREDIENTS_TEXT } from "./data/all_ingredients";

export type Span = [from: number, to: number];

// this is a row in a document sheet
export type Highlight = {
  documentId: string;
  sheetConfigId: string;
  span: Span;
  data: { [columnName: string]: any };
};
export type SheetValueRowWithoutSpan = Omit<Highlight, "span">;
export type SheetValueRow = Highlight | SheetValueRowWithoutSpan;

export type SheetConfig = {
  id: string;
  name: string;
  columns: FormulaColumn[];
};

export enum SheetView {
  Table,
  Calendar,
}

export type TextDocumentSheet = {
  id: string;
  configId: string;
  highlightSearchRange?: Span;
};

export type TextDocument = {
  id: string;
  name: string;
  text: Text;
  sheets: TextDocumentSheet[];
};

export function getSheetConfigsOfTextDocument(textDocument: TextDocument) {
  return textDocument.sheets
    .map((textDocumentSheet) =>
      sheetConfigsMobx.get(textDocumentSheet.configId)
    )
    .filter((sheetConfig) => sheetConfig !== undefined) as SheetConfig[];
}

const WORKOUT_TEXT = `Gym 3/16/22

Dead 40lb Squat 50lb, Maintain next time.

Gym 3/20/22

Dead 50lb 10x3

Gym 3/22/22
 
Squat 50 10x3
Dead 50 10x3


Gym 3/24/22

Squat 50 10x3
Dead 50 10x3

4/15/22 gym: run + plank

4/17/22 gym: elliptical + plank

4/20/22 gym:

Squat 50 10x3
Dead 50 10x3`;

export const textEditorStateMobx = observable.box(
  EditorState.create({ doc: WORKOUT_TEXT })
);

const ICE_CREAM_TEXT = `Ingredients
1¾ cups heavy cream
2¼ cup whole milk
3¾ cup sugar
4⅛ teaspoon fine sea salt
5 tablespoon vanilla extract

Instructions
Pour 1 cup of the cream into a saucepan and add the sugar, salt. Scrape the seeds of the vanilla bean into the pot and then add the vanilla pod to the pot. Warm the mixture over medium heat, just until the sugar dissolves. Remove from the heat and add the remaining cream, milk, and vanilla extract (if using extract). Stir to combine and chill in the refrigerator.
When ready to churn, remove the vanilla pod, whisk mixture again and pour into ice cream maker. Churn according to the manufacturer’s instructions. Transfer the finished ice cream to an airtight container and place in the freezer until ready to serve. Enjoy!`;

const GOCHUJANG_PORK_TEXT = `Grilled Gochujang Pork With Fresh Sesame Kimchi

Pork shoulder is often prepared as a large roast, requiring hours of cooking until it’s tender. But if you slice it thinly and pound it, the meat quickly absorbs this savory gochujang marinade and cooks up in no time. The spicy pork is balanced by a cool and crisp sesame kimchi, eaten fresh like a salad rather than fermented like traditional preparations. Baby bok choy stands in for the usual napa cabbage, and it’s coated in a vibrant sauce of garlic, ginger, gochugaru, fish sauce and nutty sesame oil. Tuck any leftover pork and kimchi into sandwiches the next day, garnished with tomatoes and mayonnaise.

2 tablespoons gochugaru
2 tablespoons distilled white vinegar
2 tablespoons toasted sesame oil
3 teaspoons grated garlic
2 teaspoons grated peeled ginger
1 teaspoon kosher salt (such as Diamond Crystal), plus more for seasoning
½ teaspoon fish sauce
1 tablespoon plus ½ teaspoon granulated sugar
1½ pounds baby bok choy, quartered lengthwise
3 scallions, halved lengthwise and thinly sliced on the diagonal
2 tablespoons gochujang (Korean chile paste)
2 tablespoons neutral oil, such as safflower or canola
1 tablespoon low-sodium soy sauce
1 teaspoon ground black pepper, plus more for seasoning
2 pounds pork shoulder, thinly sliced crosswise and pounded ⅛-inch-thick (see Tip)
1 large white onion, peeled and sliced into ¼-inch-thick rings
Steamed rice, for serving

Preparation
Step 1
In a large bowl, combine the gochugaru, vinegar, sesame oil, 1 teaspoon of the garlic, 1 teaspoon of the ginger, 1 teaspoon salt, the fish sauce and ½ teaspoon of the sugar; mix well. Add bok choy and scallions, and toss with your hands, working the sauce in between and all over the leaves.

Step 2
Heat a grill to medium-high or heat a stovetop griddle pan over medium-high. In a large bowl, combine the gochujang, neutral oil, soy sauce, 1 teaspoon black pepper and the remaining 2 teaspoons garlic, 1 teaspoon ginger and 1 tablespoon sugar; mix well. Very lightly season the pork with salt and pepper. Add pork and onion to the marinade and toss, gently massaging the marinade all over the meat (The meat does not need to rest in the marinade before it is grilled, but it can be marinated for up to 3 hours.)

Step 3
Grill the pork and onion, in batches if necessary, until nicely charred and caramelized around the edges, and the pork is cooked through, about 3 minutes per side. Transfer to a serving platter.

Step 4
Serve the grilled pork and onions with the fresh sesame kimchi and rice on the side.`;

export const WORKOUT_DOCUMENT_ID = "workout";
export const GOCHUJANG_PORK_DOCUMENT_ID = "gochujang pork";
export const ALL_INGREDIENTS_DOCUMENT_ID = "all ingredients";
export const WORKOUT_SHEET_CONFIG_ID = nanoid();
export const NUMBER_SHEET_CONFIG_ID = nanoid();
export const QUANTITY_SHEET_CONFIG_ID = nanoid();
export const ICE_CREAM_DOCUMENT_ID = "ice cream";
export const INGREDIENTS_SHEET_CONFIG_ID = nanoid();
export const ALL_INGREDIENTS_SHEET_CONFIG_ID = nanoid();
export const DATE_SHEET_CONFIG_ID = nanoid();
export const DATE_SHEET_IN_WORKOUT_ID = nanoid();
export const WORKOUT_SHEET_IN_WORKOUT_ID = nanoid();

export const textDocumentsMobx = observable.map<string, TextDocument>({
  [WORKOUT_DOCUMENT_ID]: {
    id: WORKOUT_DOCUMENT_ID,
    name: "workout",
    text: Text.of(WORKOUT_TEXT.split("\n")),
    sheets: [
      {
        id: nanoid(),
        configId: NUMBER_SHEET_CONFIG_ID,
      },
      {
        id: DATE_SHEET_IN_WORKOUT_ID,
        configId: DATE_SHEET_CONFIG_ID,
      },
      {
        id: WORKOUT_SHEET_IN_WORKOUT_ID,
        configId: WORKOUT_SHEET_CONFIG_ID,
      },
    ],
  },
  [ICE_CREAM_DOCUMENT_ID]: {
    id: ICE_CREAM_DOCUMENT_ID,
    name: "ice cream",
    text: Text.of(ICE_CREAM_TEXT.split("\n")),
    sheets: [
      {
        id: nanoid(),
        configId: INGREDIENTS_SHEET_CONFIG_ID,
        highlightSearchRange: [12, 117],
      },
      {
        id: nanoid(),
        configId: NUMBER_SHEET_CONFIG_ID,
      },
      {
        id: nanoid(),
        configId: QUANTITY_SHEET_CONFIG_ID,
      },
    ],
  },
  [GOCHUJANG_PORK_DOCUMENT_ID]: {
    id: GOCHUJANG_PORK_DOCUMENT_ID,
    name: "gochujang pork",
    text: Text.of(GOCHUJANG_PORK_TEXT.split("\n")),
    sheets: [
      {
        id: nanoid(),
        configId: INGREDIENTS_SHEET_CONFIG_ID,
        highlightSearchRange: [662, 1430],
      },
      {
        id: nanoid(),
        configId: NUMBER_SHEET_CONFIG_ID,
      },
      {
        id: nanoid(),
        configId: QUANTITY_SHEET_CONFIG_ID,
      },
    ],
  },
  [ALL_INGREDIENTS_DOCUMENT_ID]: {
    id: ALL_INGREDIENTS_DOCUMENT_ID,
    name: "all ingredients",
    text: Text.of(ALL_INGREDIENTS_TEXT.split("\n")),
    sheets: [
      {
        id: nanoid(),
        configId: ALL_INGREDIENTS_SHEET_CONFIG_ID,
      },
    ],
  },
});
let nextSheetIndex = 1;
export const sheetConfigsMobx = observable.map<string, SheetConfig>({
  [NUMBER_SHEET_CONFIG_ID]: {
    id: NUMBER_SHEET_CONFIG_ID,
    name: "numbers",
    columns: [{ name: "value", formula: 'MatchRegexp("[0-9]+")' }],
  },
  [DATE_SHEET_CONFIG_ID]: {
    id: DATE_SHEET_CONFIG_ID,
    name: "dates",
    columns: [
      {
        name: "date",
        formula: 'MatchRegexp("([0-9]{1,2})/([0-9]{1,2})/([0-9]{2})")',
      },
      { name: "day", formula: "ParseInt(Second(date.data.groups))" },
      { name: "month", formula: "ParseInt(First(date.data.groups))" },
      { name: "year", formula: "ParseInt(Third(date.data.groups))" },
    ],
  },
  [QUANTITY_SHEET_CONFIG_ID]: {
    id: QUANTITY_SHEET_CONFIG_ID,
    name: "quantity",
    columns: [
      {
        name: "unit",
        formula:
          // There are two layers of escaping going on here; todo: improve the situation by auto-escaping user input?
          'MatchRegexp("\\\\b(cup|tablespoon|tbsp|teaspoon|tsp|pound|lb|gram|g|milliliter|ml)s?\\\\b")',
      },
      { name: "amount", formula: "PrevOfType(unit, 'numbers', 20)" },
    ],
  },
  [WORKOUT_SHEET_CONFIG_ID]: {
    id: WORKOUT_SHEET_CONFIG_ID,
    name: "workouts",
    columns: [
      {
        name: "activity",
        formula: 'MatchRegexp("squat|dead|run|plank|elliptical", "i")',
      },
      {
        name: "numbers",
        formula:
          'Filter(NextValuesUntil(activity, HasType("workouts")), SameLine(activity))',
      },
      {
        name: "weight",
        formula: "First(numbers)",
      },
      {
        name: "reps",
        formula: "Second(numbers)",
      },
      {
        name: "sets",
        formula: "Third(numbers)",
      },
      {
        name: "date",
        formula: 'PrevOfType(activity, "dates")',
      },
    ],
  },
  [INGREDIENTS_SHEET_CONFIG_ID]: {
    id: INGREDIENTS_SHEET_CONFIG_ID,
    name: "ingredients",
    columns: [
      {
        name: "name",
        formula:
          'MatchString(DataFromDoc("all ingredients", "allIngredients", "name"))',
      },
      {
        name: "quantity",
        formula: 'PrevOfType(name, "quantity", 20)',
      },
    ],
  },
  [ALL_INGREDIENTS_SHEET_CONFIG_ID]: {
    id: ALL_INGREDIENTS_SHEET_CONFIG_ID,
    name: "allIngredients",
    columns: [
      {
        name: "name",
        formula: "SplitLines()",
      },
    ],
  },
});

export function addSheetConfig() {
  const id = nanoid();
  const sheetConfig = {
    id,
    name: `sheet${nextSheetIndex++}`,
    columns: [{ name: "col1", formula: "" }],
  };
  runInAction(() => {
    sheetConfigsMobx.set(id, sheetConfig);
  });
  return sheetConfig;
}

export const selectedTextDocumentIdBox = observable.box(WORKOUT_DOCUMENT_ID);
export const hoverHighlightsMobx = observable.array<Highlight>([]);

export const isSheetExpandedMobx = observable.map<string, boolean>({
  [DATE_SHEET_IN_WORKOUT_ID]: true,
  [WORKOUT_SHEET_IN_WORKOUT_ID]: true,
});
