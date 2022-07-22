import { observer } from "mobx-react-lite";
import { getTextForHighlight } from "./utils";
import {
  OFFICIAL_FOODS,
  NUTRIENTS,
  FOOD_NUTRIENTS,
  OfficialFood,
} from "./data/officialFoods";
import { SheetViewProps } from "./SheetComponent";

type FoodWithNutrition = OfficialFood & {
  calories: number;
  fat: number;
  protein: number;
  nutrients: { nutrient: string; unit: string; amount: number }[];
};

type Ingredient = {
  food: OfficialFood;
  quantity: { amount: number; unit: string };
};

const UNITS_TO_GRAMS_RATIO: { [key: string]: number } = {
  tablespoons: 15,
  tbsp: 15,
  teaspoons: 5,
  tsp: 5,
  cups: 240,
  pints: 480,
  quarts: 960,
  gallons: 3840,
  ounces: 28.35,
  pounds: 453.592,
  lbs: 453.592,
  kilograms: 1000,
  grams: 1,
  g: 1,
  milligrams: 0.001,
  milliliters: 0.001,
  liters: 1000,
};

const quantityInGrams = (ingredient: Ingredient): number | undefined => {
  const conversionRatio: number =
    UNITS_TO_GRAMS_RATIO[ingredient.quantity.unit] ??
    UNITS_TO_GRAMS_RATIO[`${ingredient.quantity.unit}s`];
  if (conversionRatio === undefined) {
    return undefined;
  }
  return conversionRatio * ingredient.quantity.amount;
};

export const NutritionLabel = observer(({ rows, textDocument }: SheetViewProps) => {
  const ingredients: Ingredient[] = rows
    .map((row) => {
      const unitHighlight = row.data?.quantity?.data?.unit;
      const amountHighlight = row.data?.quantity?.data?.amount;
      const numberHighlight = row.data?.quantity?.data?.value;
      
      let quantity;
      if (numberHighlight) {

        // manually hack to add a unit for unitless ingredients in smoothie

        const count = parseFloat(getTextForHighlight(numberHighlight) || "0")

        switch (getTextForHighlight(row.data?.name)?.toLowerCase()) {
          case "avocados":
          case "avocado":
            quantity = { amount: count * 215, unit: "g" }
            break;

          case "banana":
          case "bananas":
            quantity = { amount: count * 120, unit: "g" }
            break;

          default:
            quantity = { amount: 0, unit: "" };
        }

      } else if (unitHighlight === undefined || amountHighlight === undefined) {
        quantity = { amount: 0, unit: "" };
      } else {
        quantity = {
          unit: getTextForHighlight(unitHighlight),
          amount: parseFloat(getTextForHighlight(amountHighlight) ?? "0"),
        };
      }


      return {
        food: OFFICIAL_FOODS.find(
          (food) => food.description === row.data["USDA Name"]
        ),
        quantity,
      };
    })
    .filter((ingredient) => ingredient.food !== undefined) as Ingredient[];

  const ingredientsWithNutrition: FoodWithNutrition[] = ingredients.map(
    (ingredient) => {
      const { food } = ingredient;

      // the nutrition values are per 100g, so we need to figure out
      // how many grams we're using, and then multiply nutrients by the right ratio
      const grams = quantityInGrams(ingredient);
      if (grams === undefined) {
        return {
          ...food,
          calories: 0,
          fat: 0,
          protein: 0,
          nutrients: [],
        };
      }
      const multiplier = grams / 100.0;

      const nutrients = FOOD_NUTRIENTS.filter(
        (foodNutrient) => foodNutrient.fdc_id === food.fdc_id
      )
        .filter((foodNutrient) => foodNutrient.amount !== "0")
        .map((foodNutrient) => {
          const nutrient = NUTRIENTS.find(
            (official) => official.id === foodNutrient.nutrient_id
          )!;
          return {
            nutrient: nutrient?.name,
            nutrient_id: nutrient?.id,
            unit: nutrient?.unit_name,
            amount: parseFloat(foodNutrient.amount || "0") * multiplier,
          };
        });
      const calories =
        nutrients.find(
          (nutrient) =>
            nutrient.nutrient === "Energy" && nutrient.unit === "KCAL"
        )?.amount ?? 0;
      const fat =
        nutrients.find(
          (nutrient) =>
            nutrient.nutrient === "Total lipid (fat)" && nutrient.unit === "G"
        )?.amount ?? 0;

      const protein =
        nutrients.find(
          (nutrient) => nutrient.nutrient === "Protein" && nutrient.unit === "G"
        )?.amount ?? 0;
      console.log({
        food: food.description,
        grams,
        nutrients,
        calories,
        fat,
        protein,
      });
      return {
        ...food,
        nutrients,
        calories,
        fat,
        protein,
      };
    }
  );

  let totals: { calories: number; fat: number; protein: number } =
    ingredientsWithNutrition.reduce(
      (prev, food) => ({
        calories: prev.calories + food.calories,
        fat: prev.fat + food.fat,
        protein: prev.protein + food.protein,
      }),
      { calories: 0, fat: 0, protein: 0 }
    );

  // Round the totals
  totals = {
    calories: Math.round(totals.calories),
    fat: Math.round(totals.fat),
    protein: Math.round(totals.protein),
  };

  return (
    <div className="border-black border-4 p-2">
      <div className="text-xl font-extrabold border-b-2">Nutrition Facts</div>
      <div className="text-sm text-gray-400">For total recipe</div>
      <div className="border-b-8 border-black"></div>
      <div className="text-lg font-bold border-b-4 border-black">
        Calories <span className="float-right text-xl">{totals.calories}</span>
      </div>
      <div className="border-b-2">
        <span className="font-bold">Total Fat</span> {totals.fat} g
      </div>
      <div>
        <span className="font-bold">Total Protein</span> {totals.protein} g
      </div>
    </div>
  );
});
