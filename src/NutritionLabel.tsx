import { observer } from "mobx-react-lite";
import {
  Highlight,
  hoverHighlightsMobx,
  SheetConfig,
  SheetValueRow,
  TextDocument,
} from "./primitives";
import { FormulaColumn } from "./formulas";
import { useMemo, useState } from "react";
import { getTextForHighlight } from "./utils";
import { action } from "mobx";
import {
  OFFICIAL_FOODS,
  NUTRIENTS,
  MEASURE_UNITS,
  FOOD_NUTRIENTS,
  OfficialFood,
} from "./data/officialFoods";
import { SheetViewProps } from "./SheetComponent";

type FoodWithNutrition = OfficialFood & {
  calories: number;
  fat: number;
  protein: number;
  nutrients: { nutrient: string; unit: string; amount: string }[];
};

export const NutritionLabel = observer(
  ({ textDocument, sheetConfig, columns, rows }: SheetViewProps) => {
    const foods: OfficialFood[] = rows
      .map((row) =>
        OFFICIAL_FOODS.find((food) => food.description === row.data.normalized)
      )
      .filter((food) => food !== undefined) as OfficialFood[];

    const foodsWithNutrition: FoodWithNutrition[] = foods.map((food) => {
      const nutrients = FOOD_NUTRIENTS.filter(
        (foodNutrient) => foodNutrient.fdc_id === food.fdc_id
      )
        .filter((foodNutrient) => foodNutrient.amount !== "0")
        .map((foodNutrient) => {
          const nutrient = NUTRIENTS.find(
            (official) => official.id === foodNutrient.nutrient_id
          );
          return {
            nutrient: nutrient?.name,
            nutrient_id: nutrient?.id,
            unit: nutrient?.unit_name,
            amount: foodNutrient.amount,
          };
        });
      const calories = parseInt(
        nutrients.find(
          (nutrient) =>
            nutrient.nutrient === "Energy" && nutrient.unit === "KCAL"
        )?.amount ?? "0"
      );
      const fat = parseInt(
        nutrients.find(
          (nutrient) =>
            nutrient.nutrient === "Total lipid (fat)" && nutrient.unit === "G"
        )?.amount ?? "0"
      );
      const protein = parseInt(
        nutrients.find(
          (nutrient) => nutrient.nutrient === "Protein" && nutrient.unit === "G"
        )?.amount ?? "0"
      );
      console.log({ food, nutrients, calories, fat, protein });
      return {
        ...food,
        nutrients,
        calories,
        fat,
        protein,
      };
    });

    const totals: { calories: number; fat: number; protein: number } =
      foodsWithNutrition.reduce(
        (prev, food) => ({
          calories: prev.calories + food.calories,
          fat: prev.fat + food.fat,
          protein: prev.fat + food.protein,
        }),
        { calories: 0, fat: 0, protein: 0 }
      );

    return (
      <div>
        <div className="text-md font-bold">Nutrition Facts</div>
        <div className="text-sm text-gray-400">For total recipe</div>
        <div>Calories: {totals.calories} kcal</div>
        <div>Fat: {totals.fat} g</div>
        <div>Protein: {totals.protein} g</div>
      </div>
    );
  }
);
