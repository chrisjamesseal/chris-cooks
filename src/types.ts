export type MainCategory = 'Breakfast' | 'Lunch' | 'Dinner' | 'Side' | 'Dessert' | 'Snack'

export type Recipe = {
  id: string
  schemaVersion: number
  title: string
  image?: string
  source?: { type: 'url' | 'tiktok' | 'instagram' | 'manual'; url?: string }
  mainCategory: MainCategory
  /** Extra categories the recipe should also appear under (e.g. pancakes in Breakfast AND Lunch). */
  alsoCategories?: MainCategory[]
  cuisine?: string
  servings: number
  times: { prep?: string; cook?: string; total?: string }
  ingredients: Ingredient[]
  steps: Step[]
  nutrition?: Nutrition
  /** True when the nutrition came from an AI estimate rather than the source recipe. */
  nutritionEstimated?: boolean
  favorite?: boolean
  notes?: string
  cookedCount?: number
  lastCookedAt?: number
  createdAt: number
  updatedAt: number
}

export type Ingredient = {
  id: string
  raw: string
  quantity?: number
  unit?: string
  item: string
  note?: string
  uncertain?: boolean
}

export type Step = {
  id: string
  text: string
  ingredientRefs?: string[]
  durationSeconds?: number
}

export type Nutrition = {
  servingSizeG?: number
  calories?: number
  fatG?: number
  satFatG?: number
  cholesterolMg?: number
  sodiumMg?: number
  carbsG?: number
  fiberG?: number
  sugarG?: number
  proteinG?: number
}
