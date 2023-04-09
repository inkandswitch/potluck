import { Configuration, OpenAIApi } from "openai";
import { PendingSearch, PropertyVisibility } from "./primitives";

console.log("env", import.meta.env, import.meta.env["VITE_OPENAI_API_KEY"]);

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

Only output a JSON object. Do not output any text before or after the JSON.

Your task is to write a code snippet that finds patterns in some text. You'll be given an example text document, and a natural langauge description of the desired pattern. The code should be in the Potluck search language, which I will describe below.

## Output format

Output a JSON object in the following shape. Do not include any other text before or after the JSON.

enum PropertyVisibility {
  Hidden = "HIDDEN",
  Inline = "INLINE",
  Superscript = "SUPERSCRIPT",
  Replace = "REPLACE",
  Style = "STYLE",
}

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
      /* How to show the computation output. Default to "HIDDEN" for intermediate values,
       * and use "INLINE" for the final output of a computation. */
      visibility: PropertyVisibility
		}
	}>
}

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

## Potluck computation language

A Potluck search also has an array of _computations_, which compute derived values based on the values returned by the search. The computation code is written in JavaScript (no npm libraries may be used). The code for a computation can reference the following values:

- $ refers to the entire string returned by the search
- Any named capture group can be referenced by name. (Note: Capture groups MAY NOT be implicitly referenced with a number like $1. if you want to reference a group, you MUST assign it a name.)
- The name of any prior computation in the list may be referenced by name

When the user asks for a numeric computation, you should add a computation to do the raw math, and then add another computation which adds a unit.

For example, if the user asked you to double the number of bananas in the doc, you could return the following search and "computations":

{
	"name": "numBananas",
	"search": "{number:amount} bananas",
	"computations": [
		{ "name": "doubled", "formula": "amount * 2", "visibility": "HIDDEN" },
		{ "name": "doubledWithLabel", "formula": "\${doubled} bananas", "visibility": "INLINE" }
	]
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
}`;

export const createSearchWithLLM = async (
  doc: string,
  search: string
): Promise<PendingSearch | { _type: "error" }> => {
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `
      ### User-provided text

Here is the text of the document the user is searching:

${doc}

### User-provided search

${search}
      `,
      },
    ],
  });

  const output = response.data.choices[0].message?.content as string;

  console.log("raw LLM output");
  console.log(output);

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
