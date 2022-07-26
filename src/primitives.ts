import { observable, runInAction } from "mobx";
import { EditorState, Text } from "@codemirror/state";
import { FormulaColumn } from "./formulas";
import { ALL_INGREDIENTS_TEXT } from "./data/all_ingredients";
import { generateNanoid } from "./utils";
import { EventEmitter } from "eventemitter3";

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

type HighlightStyle =
  | { _type: "color"; name: string; rgb: { r: number; g: number; b: number } }
  | { _type: "custom"; style: string };

export type SheetConfig = {
  id: string;
  name: string;
  columns: FormulaColumn[];
  highlightStyle?: HighlightStyle;
};

export const DEFAULT_SHEET_STYLE_OPTIONS: HighlightStyle[] = [
  { _type: "color", name: "red", rgb: { r: 255, g: 0, b: 0 } },
  { _type: "color", name: "yellow", rgb: { r: 255, g: 255, b: 0 } },
];

export enum SheetView {
  Table,
  Calendar,
  NutritionLabel,
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

const WORKOUT_TEXT = `Gym 7/20/22

Bench 30 Squat 40, Maintain next time.

Gym 7/18/22

Bench 30kg 10x3
Squat 35kg 10x3  (easy, could increase weights next)

Gym 7/16/22

Squat 30kg 10x3
Bench 35kg 10x3

Try to focus on form more

Gym 7/13/22

Squat 30 10x3
Bench 35 10x3

Gym 7/12/22

run 10 km

Squat 30 10x3
Bench 35 10x3

7/7/22 gym: elliptical + bench

7/6/22 gym: squat 30, bench 30

7/4/22 gym: run + squat

7/1/22 gym:

Squat 30 10x3
Bench 35 10x3, felt a bit sore`;

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

const PIZZA_TEXT = `Sheet Pan Corn Pizza With Kimchi and Hot Dogs

5 Tbsp. extra-virgin olive oil, divided
1 lb. store-bought pizza dough, room temperature
1 14.5-oz. can crushed tomatoes
2 tsp. sugar
1 cup coarsely chopped drained kimchi, plus juice from jar (optional)
Kosher salt
8 oz. low-moisture mozzarella, grated
1 medium green bell pepper, cut into ¼" pieces
4 all-beef or other hot dogs, sliced into ½" coins
2 cups corn (from about 2 ears)
3 scallions, thinly sliced

Step 1
Coat a large rimmed baking sheet with 4 Tbsp. extra-virgin olive oil. Place 1 lb. store-bought pizza dough, room temperature, in center of baking sheet; using your fingers, gradually stretch dough outward from center until it reaches to edges and into corners of baking sheet. (If dough is too stiff or springs back, cover with an inverted baking sheet or plastic wrap and let rest 10 minutes before trying again. You may need to let dough rest 2 or 3 times.) Cover and let rise in a warm spot until slightly puffy, about 30 minutes.

Step 2
While the dough is rising, place a rack in lowest position of oven; preheat to 475°. Combine one 14.5-oz. can crushed tomatoes, 2 tsp. sugar, remaining 1 Tbsp. extra-virgin olive oil, and up to ¼ cup kimchi juice (if using) in a small saucepan. Bring to a simmer over medium heat and cook, stirring occasionally, until sauce is slightly reduced, 7–10 minutes. Remove from heat; season with salt.

Step 3
Uncover dough and scatter 8 oz. low-moisture mozzarella, grated, over, going all the way to the edges. Dollop sauce over (do not spread), then evenly top with 1 medium green bell pepper, cut into ¼" pieces, 4 all-beef or other hot dogs, sliced into ½" coins, 2 cups corn kernels (from about 2 ears), and 1 cup coarsely chopped drained kimchi.

Step 4
Bake pizza until cheese is melted and crust is golden brown on bottom and sides (lift an edge with a heatproof spatula to check), 22–28 minutes. If crust feels soft or bendy in center, loosely cover pizza with foil and continue to bake 8–10 minutes longer.

Step 5
To serve, top pizza with 3 scallions, thinly sliced; cut into squares.`;

export const WORKOUT_DOCUMENT_ID = "workout";
export const GOCHUJANG_PORK_DOCUMENT_ID = "gochujang pork";
export const PIZZA_DOCUMENT_ID = generateNanoid();
export const ALL_INGREDIENTS_DOCUMENT_ID = "all ingredients";
export const WORKOUT_SHEET_CONFIG_ID = generateNanoid();
export const NUMBER_SHEET_CONFIG_ID = generateNanoid();
export const QUANTITY_SHEET_CONFIG_ID = generateNanoid();
export const ICE_CREAM_DOCUMENT_ID = "ice cream";
export const INGREDIENTS_SHEET_CONFIG_ID = generateNanoid();
export const ALL_INGREDIENTS_SHEET_CONFIG_ID = generateNanoid();
export const MARKDOWN_SHEET_CONFIG_ID = generateNanoid();
export const DATE_SHEET_CONFIG_ID = generateNanoid();
export const DATE_SHEET_IN_WORKOUT_ID = generateNanoid();
export const WORKOUT_SHEET_IN_WORKOUT_ID = generateNanoid();
export const INGREDIENTS_SHEET_IN_GOCHUJANG_ID = generateNanoid();
export const INGREDIENTS_SHEET_IN_PIZZA_ID = generateNanoid();

export const textDocumentsMobx = observable.map<string, TextDocument>({
  [WORKOUT_DOCUMENT_ID]: {
    id: WORKOUT_DOCUMENT_ID,
    name: "workout",
    text: Text.of(WORKOUT_TEXT.split("\n")),
    sheets: [
      {
        id: generateNanoid(),
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
        id: generateNanoid(),
        configId: INGREDIENTS_SHEET_CONFIG_ID,
        highlightSearchRange: [12, 117],
      },
      {
        id: generateNanoid(),
        configId: NUMBER_SHEET_CONFIG_ID,
      },
      {
        id: generateNanoid(),
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
        id: INGREDIENTS_SHEET_IN_GOCHUJANG_ID,
        configId: INGREDIENTS_SHEET_CONFIG_ID,
        highlightSearchRange: [662, 1430],
      },
      {
        id: generateNanoid(),
        configId: NUMBER_SHEET_CONFIG_ID,
      },
      {
        id: generateNanoid(),
        configId: QUANTITY_SHEET_CONFIG_ID,
      },
    ],
  },
  [PIZZA_DOCUMENT_ID]: {
    id: PIZZA_DOCUMENT_ID,
    name: "sheet pan corn kimchi pizza",
    text: Text.of(PIZZA_TEXT.split("\n")),
    sheets: [
      {
        id: INGREDIENTS_SHEET_IN_PIZZA_ID,
        configId: INGREDIENTS_SHEET_CONFIG_ID,
      },
      {
        id: generateNanoid(),
        configId: NUMBER_SHEET_CONFIG_ID,
      },
      {
        id: generateNanoid(),
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
        id: generateNanoid(),
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
        formula: 'MatchRegexp("squat|bench|rowing|triceps|elliptical", "i")',
      },
      {
        name: "numbers",
        formula:
          'Filter(NextUntil(activity, HasType("workouts")), SameLine(activity))',
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
          'MatchHighlight(DataFromDoc("all ingredients", "allIngredients", "name"))',
      },
      /*{
        name: "matched",
        formula: "name.data.matchedHighlight",
      },*/
      /*{
        name: "quantity",
        formula: 'PrevOfType(name, ["quantity", "numbers"], 20)',
      },*/
      {
        name: "USDA Name",
        formula: "USDAFoodName(name)",
      },
      {
        name: "quantity",
        formula: 'PrevOfType(name, ["quantity", "numbers"], 20)',
      },
    ],
  },
  [ALL_INGREDIENTS_SHEET_CONFIG_ID]: {
    id: ALL_INGREDIENTS_SHEET_CONFIG_ID,
    name: "allIngredients",
    columns: [
      {
        name: "name",
        formula: 'SplitLines(",")',
      },
      {
        name: "officialName",
        formula:
          'First(Filter(MatchRegexp("USDA name: (.*),?"), SameLine(name)))',
      },
    ],
  },
  [MARKDOWN_SHEET_CONFIG_ID]: {
    id: MARKDOWN_SHEET_CONFIG_ID,
    name: "markdown",
    columns: [
      {
        name: "text",
        formula: "Markdown()",
      },
      {
        name: "type",
        formula: "text.data.type",
      },
    ],
  },
});

export function addSheetConfig() {
  const id = generateNanoid();
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
  [INGREDIENTS_SHEET_IN_GOCHUJANG_ID]: true,
  [INGREDIENTS_SHEET_IN_PIZZA_ID]: true,
});
