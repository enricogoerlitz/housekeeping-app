// Every database read of the AI functions, in one place. All queries run with the caller's
// client, so RLS decides what is visible: a household id the caller is not a member of
// returns nothing. Rows are validated leniently: malformed JSON entries are skipped.
import { z } from 'zod';

import type { Query, UserClient } from './deps.ts';

const MAX_RECIPES = 500;
const MAX_CHORES = 200;
const PLAN_DAYS = 7;

const text = z.string();
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);
const textList = z
  .array(z.string())
  .nullish()
  .transform((value) => value ?? []);

const HouseholdRow = z.object({
  id: text,
  name: text,
  meal_slots: z.array(z.unknown()).nullish(),
  default_list_id: optionalText,
});
const MealSlot = z.object({ id: text, name: text });
const MemberRow = z.object({ profile_id: text });
const ProfileRow = z.object({ id: text, name: text, diet_preference: optionalText });
const ListRow = z.object({ id: text, name: text, is_default: z.boolean().nullish() });
const ChoreRow = z.object({ id: text, title: text, next_due_on: optionalText });
const PlanRow = z.object({
  date: optionalText,
  slot_id: text,
  kind: text,
  recipe_id: optionalText,
  text: optionalText,
});
const RecipeRow = z.object({
  id: text,
  title: text,
  servings: z.number().nullish(),
  tags: textList,
  course: optionalText,
  cuisine: optionalText,
  total_minutes: z.number().nullish(),
  variants: z.array(z.unknown()).nullish(),
  ingredients: z.array(z.unknown()).nullish(),
});
const Variant = z.object({ id: text, name: text });
const Ingredient = z.object({
  id: text,
  name: text,
  amount: z.object({ text: z.string() }).nullish(),
  variantId: z.string().nullish(),
});

function rows<T>(schema: z.ZodType<T>, data: unknown): T[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

async function read<T>(query: Query, schema: z.ZodType<T>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`context query failed: ${error.code ?? 'unknown'}`);
  return rows(schema, data);
}

/** "YYYY-MM-DD" in Europe/Berlin, the household's calendar. */
export function berlinDate(now: Date, addDays = 0): string {
  const shifted = new Date(now.getTime() + addDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted);
}

export interface OpenRecipe {
  id: string;
  title: string;
  servings?: number;
  variants: { id: string; name: string }[];
  ingredients: { id: string; name: string; amount?: string; variantId?: string }[];
}

export interface AssistantContext {
  today: string;
  household: { id: string; name: string; defaultListId?: string };
  mealSlots: { id: string; name: string }[];
  members: { id: string; name: string; dietPreference?: string }[];
  lists: { id: string; name: string; isDefault: boolean }[];
  recipes: { id: string; title: string; tags: string[]; minutes?: number }[];
  openRecipe?: OpenRecipe;
  chores: { id: string; title: string; nextDueOn?: string }[];
  plan: { date?: string; slotId: string; kind: string; recipeId?: string; text?: string }[];
}

/** Undefined when the household is not visible to the caller. */
export async function loadAssistantContext(
  client: UserClient,
  householdId: string,
  recipeId: string | undefined,
  now: Date,
): Promise<AssistantContext | undefined> {
  const today = berlinDate(now);
  const select = (table: string, columns: string) => client.from(table).select(columns);
  const [households, memberRows, lists, recipes, open, chores, plan] = await Promise.all([
    read(
      select('households', 'id, name, meal_slots, default_list_id').eq('id', householdId),
      HouseholdRow,
    ),
    read(select('household_members', 'profile_id').eq('household_id', householdId), MemberRow),
    read(select('shopping_lists', 'id, name, is_default').eq('household_id', householdId), ListRow),
    read(
      select('recipes', 'id, title, tags, total_minutes')
        .eq('household_id', householdId)
        .limit(MAX_RECIPES),
      RecipeRow,
    ),
    recipeId
      ? read(
          select('recipes', 'id, title, servings, variants, ingredients')
            .eq('household_id', householdId)
            .eq('id', recipeId),
          RecipeRow,
        )
      : Promise.resolve([]),
    read(
      select('chores', 'id, title, next_due_on').eq('household_id', householdId).limit(MAX_CHORES),
      ChoreRow,
    ),
    read(
      select('meal_plan_entries', 'date, slot_id, kind, recipe_id, text')
        .eq('household_id', householdId)
        .gte('date', today)
        .lte('date', berlinDate(now, PLAN_DAYS)),
      PlanRow,
    ),
  ]);
  const household = households[0];
  if (!household) return undefined;
  const memberIds = memberRows.map((row) => row.profile_id);
  const profiles =
    memberIds.length > 0
      ? await read(select('profiles', 'id, name, diet_preference').in('id', memberIds), ProfileRow)
      : [];
  const recipe = open[0];
  return {
    today,
    household: { id: household.id, name: household.name, defaultListId: household.default_list_id },
    mealSlots: rows(MealSlot, household.meal_slots),
    members: profiles
      .filter((profile) => memberIds.includes(profile.id))
      .map((profile) => ({
        id: profile.id,
        name: profile.name,
        dietPreference: profile.diet_preference,
      })),
    lists: lists.map((list) => ({
      id: list.id,
      name: list.name,
      isDefault: list.is_default === true,
    })),
    recipes: recipes.map((r) => ({
      id: r.id,
      title: r.title,
      tags: r.tags,
      minutes: r.total_minutes ?? undefined,
    })),
    openRecipe: recipe && {
      id: recipe.id,
      title: recipe.title,
      servings: recipe.servings ?? undefined,
      variants: rows(Variant, recipe.variants),
      ingredients: rows(Ingredient, recipe.ingredients).map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        amount: ingredient.amount?.text,
        variantId: ingredient.variantId ?? undefined,
      })),
    },
    chores: chores.map((chore) => ({
      id: chore.id,
      title: chore.title,
      nextDueOn: chore.next_due_on,
    })),
    plan: plan.map((entry) => ({
      date: entry.date,
      slotId: entry.slot_id,
      kind: entry.kind,
      recipeId: entry.recipe_id,
      text: entry.text,
    })),
  };
}

export interface RecipeIndexEntry {
  id: string;
  title: string;
  tags: string[];
  course?: string;
  cuisine?: string;
  minutes?: number;
  variants: string[];
  ingredients: string[];
}

/** The household's recipes as a compact search index. */
export async function loadRecipeIndex(
  client: UserClient,
  householdId: string,
): Promise<RecipeIndexEntry[]> {
  const recipes = await read(
    client
      .from('recipes')
      .select('id, title, tags, course, cuisine, total_minutes, variants, ingredients')
      .eq('household_id', householdId)
      .limit(MAX_RECIPES),
    RecipeRow,
  );
  return recipes.map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    tags: recipe.tags,
    course: recipe.course,
    cuisine: recipe.cuisine,
    minutes: recipe.total_minutes ?? undefined,
    variants: rows(Variant, recipe.variants).map((variant) => variant.name),
    ingredients: [...new Set(rows(Ingredient, recipe.ingredients).map((i) => i.name))],
  }));
}
