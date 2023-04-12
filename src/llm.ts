import { Configuration, OpenAIApi } from "openai";
import { PendingSearch, PropertyVisibility, SheetConfig } from "./primitives";

const configuration = new Configuration({
  apiKey: import.meta.env["VITE_OPENAI_API_KEY"],
});
export const openai = new OpenAIApi(configuration);

type LLMResponse = {
  /* a human-readable name for the search (camel-cased with no spaces) */
  name: string;
  /* code for a Potluck search (search language described below) */
  search: string;
  computations: Array<{
    /* a human-readable name for the computed value (camel-cased with no spaces) */
    name: string;
    /* JavaScript code for a computation (computation language described below) */
    formula: string;
    /* How to show the computation output. Default to "HIDDEN" for intermediate values,
     * and use "INLINE" for the final output of a computation. */
    visibility: PropertyVisibility;
  }>;
};

const SYSTEM_PROMPT = `You are a helpful AI coding assistant. You follow the user's instructions carefully and exactly to the letter.
`;

const POTLUCK_TUTORIAL = `Here's a summary of the Potluck search language and computation language, which you will need to understand to complete your task.

## Potluck search language

A Potluck search represents a pattern found in some text. It's similar to regular expressions, with a few differences.

1) Literals: A string literal is a valid search. For example, the following "search":

{
	"name": "scale by",
	"search": "scale by",
	"computations": []
}

will just find any instances of the text "scale by".

2) Regex: You can include any regular expression inside curly braces {} as part of the pattern. For example, the following "search":

{
	"name": "numBananas",
	"search": "{/[0-9][0-9\.]*/} bananas",
	"computations": []
}

will match strings like "23 bananas".

It's ok to have multiple curly-brace patterns within a search.

3) Predefined patterns: The language has a few built-in searches:

- number: finds a number
- emoji: finds an emoji

You can reference these strings within curly braces. For example, the following "search":

{
	"name": "numBananas",
	"search": "{number} bananas",
	"computations": []
}

will also match strings like "23 bananas"

4) Named capture groups

You can optionally assign a name inside a curly brace, which captures the text matched by that curly brace expression and assigns it a name. For example, if we wanted to extract the number from the bananas above, we could write:

{
	"name": "numBananas",
	"search": "{number:amount} bananas",
	"computations": []
}

and it would return the number of bananas as a value named amount.

We can also assign a name to a regex in a curly brace, like this:

{/[0-9][0-9\.]*/:amount} bananas

5) Make sure your search will match all the relevant values in the document. In addition, try to make the search general enough that it will match future values the user might write that should match the search. For example, if the user has written a document that contains durations written like "2 hours", and asks you to "find durations", it would be too narrow just search for "{number} hours", you should instead write a search that includes many duration units, like:

{
	"name": "durations",
	"search": "{number} {/(hours|minutes|seconds|days)/:unit}",
	"computations": []
}

6) Occasionally you may need a more sophisticated computation to find the matching text within a document. You can write = followed by a Potluck computation formula that returns highlights. For example, the following search finds spans of Markdown-formatted text:

{
	"name": "markdown",
	"search": "=Markdown()",
	"computations": []
}

## Potluck computation language

A Potluck search also has an array of _computations_, which compute derived values based on the values returned by the search.

The computation code is written in JavaScript. The code can reference the following values:

- $ refers to the entire string returned by the search
- Any named capture group can be referenced by name. (Note: Capture groups MAY NOT be implicitly referenced with a number like $1. if you want to reference a group, you MUST assign it a name.)
- The name of any prior computation in the list may be referenced by name

### Intermediate values

When the user asks for a numeric computation, you should add a computation to do the raw math, and then add another computation which adds a unit.

For example, if the user asked:

double the number of bananas

You could return the following search and computations:

{
	"name": "numBananas",
	"search": "{number:amount} bananas",
	"computations": [
		{ "name": "doubled", "formula": "amount * 2",  },
		{ "name": "doubledWithLabel", "formula": "\${doubled} bananas", "visibility": "INLINE" }
	]
}

### Styling

A computation can change the style of the text.
The name of the computation is the CSS property (use dashes, do not use camelcase).
The return value of the computation is the CSS value.
To have a styling effect the visibility should be set to "STYLE".

For example, if the user asked:

highlight any number of bananas and make it bold

You could return the following search and computations:

{
	"name": "numBananas",
	"search": "{number:amount} bananas",
	"computations": [
		{ "name": "background-color", "formula": "'yellow'", visibility: "STYLE" },
		{ "name": "font-weight", "formula": "'bold'", visibility: "STYLE" },
	]
}

### Standard Library

There are some predefined functions in the standard library which may be used in the JavaScript code for a computation. Here are the type signatures below.

Note: Highlight is a datatype representing a text span in the document. The result of a Potluck search is a highlight. To treat a Highlight as a string, use TextOfHighlight(highlight).

Functions that return highlights and are useful for searches:

SplitLines(until?: string) => Highlight[]
MatchRegexp(regexString: string, flags?: string) => Highlight[]
MatchString(values: string | string[] | Highlight[], isCaseSensitive?: boolean) => Highlight[]
MatchHighlight(values: Highlight[], isCaseSensitive?: boolean) => Highlight[]
Find(type: string) => Highlight
FindAll(type: string) => Highlight[]
Markdown() => Highlight[]
DataFromDoc(docName: string, sheetConfigName: string, columnName: string) => Highlight[]

Functions which can start from a given highlight and return spatially related highlights:

NextOfType(highlight: Highlight, type: string, distanceLimit?: number) => Highlight
PrevOfType(highlight: Highlight, type: string, distanceLimit?: number) => Highlight
PrevUntil(highlight: Highlight, stopCondition: any) => Highlight[]
NextUntil(highlight: Highlight, stopCondition: any) => Highlight[]

Functions for working with highlights:

HasType(type: string, highlight: Highlight) => boolean
HasTextOnLeft(text: string, highlight: Highlight) => boolean
HasTextOnRight(text: string, highlight: Highlight) => boolean
TextAfter(highlight: Highlight, until: string) => Highlight
TextBefore(highlight: Highlight, until: string) => Highlight
TextOfHighlight(highlight: Highlight) => string
SameLine(a: Highlight, b: Highlight) => boolean

General computational utilities:

Filter(list: any[], condition: any) => any[]
Not(value: any)
First(list: any[])
Second(list: any[])
Third(list: any[])
ParseInt(number: string)
ParseFloat(number: string)
Uppercase(text: Highlight | string) => string
Lowercase(text: Highlight | string) => string
IsNumber(value: any)
Sum(values: (number | Highlight)[])
Average(values: (number | Highlight)[])
Round(value: number, precision: number = 0)
Repeat(text: string, count: number | Highlight)
NowDate() => Date
USDAFoodName(foodName: Highlight) => string?
HasCursorFocus() => boolean

These formulas output interactive components which can be included back in the document:

Slider(highlight: Highlight, initialValue: number = 0) => Component
Timer(durationHighlight: Highlight) => Component
TemplateButton(highlight: Highlight, buttonLabel: string, updateText: string, operation?: "append" | "prepend" | "replace") => Component

## Type signatures

Here are some relevant type signatures for background:

/** Options for how to show value of a given property within the text document */
export enum PropertyVisibility {
  Hidden = "HIDDEN",
  Inline = "INLINE",
  Superscript = "SUPERSCRIPT",
  Replace = "REPLACE",
  Style = "STYLE",
}

export type PropertyDefinition = {
  /** A human-visible name for the property */
  name: string;
  /** Computation code for the property */
  formula: string;
  /** True if this property is a capture group from the search pattern, rather than a JS computation */
  isPatternGroup?: boolean;
  /** Defines how the property is shown in the document */
  visibility: PropertyVisibility;
};

export type SheetConfig = {
  id: string;
  name: string;
  properties: PropertyDefinition[];
};
`;

const CREATE_SHEET_INSTRUCTIONS = `
Your task is to write a code snippet that finds patterns in some text. You'll be given an example text document, and a natural language description of the desired pattern. Only output a JSON object. Do not output any text before or after the JSON.

## Output format

Output a JSON object in the following shape. Do not include any other text before or after the JSON.

type Output = {
	/* a human-readable name for the search (camel-cased with no spaces) */
	name: string;
	/* code for a Potluck search (search language described below) */
	search: string;
	computations: Array<{
			/* a human-readable name for the computed value (camel-cased with no spaces) */
			name: string;
			/* JavaScript code for a computation (computation language described below) */
			formula: string;
      /* How to show the computation output.
       * Default to "HIDDEN" for intermediate values.
       * Use "INLINE" for the final output of a computation.
       * Use "STYLE" if the user wants to restyle some text. */
      visibility: PropertyVisibility
		}
	}>
}

## Example

### User-provided text

🌲 Big Pine Creek 14 miles
🌲 Sea to Summit 7 miles
🌲 Redwood Regional Park 8 miles

### User-provided search

convert hike distances from miles to km

### Your output

{
	"name": "hikeDistances",
	"search": "{number: distance} {/(miles|mi)/:unit}",
	"computations": [
		{ "name": "km", "code": "distance * 1.6093", "visibility": "HIDDEN" },
		{ "name": "kmWithLabel", "code": "\`\${km} km\`", "visibility": "INLINE" }
	]
}
`;

export const createSearchWithLLM = async (
  doc: string,
  search: string
): Promise<PendingSearch | { _type: "error" }> => {
  const createSheetMessage = `
  ---

  ${POTLUCK_TUTORIAL}

  ---

  ${CREATE_SHEET_INSTRUCTIONS}

Here is the text of the document the user is searching:

${doc}

### User-provided search

${search}
  `;

  // console.log(createSheetMessage);

  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: createSheetMessage,
      },
    ],
  });

  // console.log({ response });
  const output = response.data.choices[0].message?.content as string;

  try {
    const parsed: LLMResponse = JSON.parse(output);
    return {
      _type: "new",
      ...parsed,
    };
  } catch {
    console.error("Failed to parse output", output);
    return {
      _type: "error",
    };
  }
};

const EXPLAIN_SHEET_INSTRUCTIONS = `
Your task is to generate a brief natural language description summarizing the behavior of a Potluck sheet which contains a search and some computational properties.

Rules:

- Your explanation MUST reference ALL of the individual properties in the sheet. Use the syntax [@property_name] to refer to a property. For example, you can say things like "This computation outputs [@distance] and [@unit]."
- Be concise. Your explanation should be three or four short sentences.
- Refer to the sheet as a "sheet", not a SheetConfig.

## Example

### User-provided document

Recipe
Grind 11 g coffee, medium-fine.
Add 200 g water, brew 2 minutes, plunge!

scale by

Notes
6/22/22: Pretty good, but forgot to swirl.
6/23/22: Felt weak and under-extracted. Grind finer?

### SheetConfig

{"id":"food.quantity","name":"quantity","properties":[{"name":"$","formula":"{number:amount} {/(cup|tablespoon|tbsp|teaspoon|tsp|pound|lb|gram|g|milliliter|ml)s?/:unit}","visibility":"HIDDEN"},{"name":"amount","isPatternGroup":true,"formula":"","visibility":"HIDDEN"},{"name":"unit","isPatternGroup":true,"formula":"","visibility":"HIDDEN"},{"name":"scaleFactor","formula":"Find(\"scale\")?.data.sliderValue","visibility":"HIDDEN"},{"name":"scaledAmount","formula":"(scaleFactor && scaleFactor !== 1 && amount) ? \`\${scaleFactor * amount.data.value} \${unit}\${amount.data.value === 1 ? 's' : ''}\` : undefined","visibility":"REPLACE"}]}

### Your output

This sheet scales quantities in a recipe. It extracts the [@amount] and [@unit] for each quantity, and extracts the scaling factor from the text into [@scaleFactor]. Then [@scaledAmount] does the multiplication and replaces the original quantity in the document.

`;

export const explainSheetWithLLM = async (
  doc: string,
  config: SheetConfig
): Promise<string> => {
  const explainSheetMessage = `
  ---

  ${POTLUCK_TUTORIAL}

  ---

  ${EXPLAIN_SHEET_INSTRUCTIONS}

### User-provided document

${doc}

### SheetConfig

${JSON.stringify(config)}

### Your output

  `;

  console.log(explainSheetMessage);

  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: explainSheetMessage,
      },
    ],
  });

  // console.log({ response });
  const output = response.data.choices[0].message?.content as string;

  return output;
};
