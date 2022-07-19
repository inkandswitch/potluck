// @ts-ignore
import officialFoods from "./officialFoodIds.csv";
// @ts-ignore
import nutrients from "./nutrient.csv";
// @ts-ignore
import measureUnits from "./measure_unit.csv";
// @ts-ignore
import foodNutrients from "./food_nutrient_filtered.csv";

export type OfficialFood = {
  fdc_id: string;
  data_type: string;
  description: string;
  food_category_id: string;
  publication_date: string;
};

export type FoodNutrient = {
  id: string;
  fdc_id: string;
  nutrient_id: string;
  amount: string;
  data_points: string;
  derivation_id: string;
};

export const OFFICIAL_FOODS = officialFoods as OfficialFood[];
export const NUTRIENTS = nutrients as { [key: string]: string }[];
export const MEASURE_UNITS = measureUnits as { [key: string]: string }[];
export const FOOD_NUTRIENTS = foodNutrients as FoodNutrient[];
