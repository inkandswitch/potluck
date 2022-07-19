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
  calories: number | undefined;
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
            unit: nutrient?.unit_name,
            amount: foodNutrient.amount,
          };
        });
      const calories = nutrients.find(
        (nutrient) => nutrient.nutrient === "Energy" && nutrient.unit === "KCAL"
      )?.amount;
      return {
        ...food,
        nutrients,
        calories,
      };
    });
    return (
      <div>
        <div>Nutrition is good!</div>
        {foodsWithNutrition.map((food) => (
          <div>
            {food?.description ?? "unknown"} ({food.calories} cal)
          </div>
        ))}
      </div>
    );
  }
);
