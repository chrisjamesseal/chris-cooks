import type { MainCategory } from '../types'

// A clean stand-in for recipes without a photo: a soft gradient tinted by
// category with a dish-appropriate emoji picked from the title. Deterministic,
// self-contained (no network), and always on-brand.

const TITLE_EMOJI: [RegExp, string][] = [
  [/pancake|waffle|french toast/, '🥞'],
  [/oat|porridge|granola|muesli|chia/, '🥣'],
  [/egg|frittata|shakshuka|omelet|scotch egg/, '🍳'],
  [/pizza/, '🍕'],
  [/burger|smash/, '🍔'],
  [/taco|fajita|nacho|quesadilla/, '🌮'],
  [/shawarma|wrap|kebab|gyro/, '🌯'],
  [/pasta|spaghetti|rigatoni|lasagne|gnocchi|macaroni|carbonara|pesto/, '🍝'],
  [/noodle|ramen|pad thai|chow mein|stir.?fry|nasi|singapore/, '🍜'],
  [/risotto|paella|fried rice|biryani|rice|pilaf/, '🍚'],
  [/curry|tikka|masala|rogan|katsu|korma|butter chicken|dal|dhal/, '🍛'],
  [/soup|chowder|bisque|broth|ramen/, '🍲'],
  [/salad|slaw|caviar|cole slaw/, '🥗'],
  [/sushi|poke|sashimi/, '🍣'],
  [/prawn|shrimp/, '🍤'],
  [/salmon|fish|tuna|cod|haddock/, '🐟'],
  [/duck/, '🦆'],
  [/chicken|nando|satay|coronation|marry me/, '🍗'],
  [/steak|beef|ribs|wellington|sirloin|brisket/, '🥩'],
  [/sausage|hot ?dog|toad in|chorizo|gammon|bacon|pork|ham/, '🥓'],
  [/potato|mash|dauphinoise|hasselback|jacket|parmentier|parametier|chips/, '🥔'],
  [/carrot|parsnip|broccoli|pea|corn|mushroom|asparagus|cauliflower|sprout/, '🥦'],
  [/bread|dough|scone|roll|bun|focaccia/, '🍞'],
  [/cake|gateau|banoffee|cheesecake|sponge/, '🍰'],
  [/brownie|chocolate|biscuit|cookie|fudge/, '🍪'],
  [/pie|crumble|tart|pudding|custard/, '🥧'],
  [/pineapple/, '🍍'],
  [/banana/, '🍌'],
  [/apple/, '🍎'],
  [/lemon|lime/, '🍋'],
  [/strawberr|berry|blueberr/, '🍓'],
  [/sauce|hollandaise|tartar|peppercorn|bbq|gravy|dip|chutney|salsa/, '🥫'],
  [/chickpea|lentil|bean|falafel|tofu|quorn|vegan|vegetarian|hummus/, '🥘'],
  [/cheese|cheddar|halloumi/, '🧀'],
]

const CATEGORY_EMOJI: Record<MainCategory, string> = {
  Breakfast: '🍳',
  Lunch: '🥗',
  Dinner: '🍽️',
  Dessert: '🍰',
  Snack: '🥨',
}

const CATEGORY_GRADIENT: Record<MainCategory, string> = {
  Breakfast: 'linear-gradient(135deg, #ffe9c7, #ffc9a3)',
  Lunch: 'linear-gradient(135deg, #d8f2df, #a7ddb9)',
  Dinner: 'linear-gradient(135deg, #cdeede, #97d3ba)',
  Dessert: 'linear-gradient(135deg, #ffe2ec, #ffc0d6)',
  Snack: 'linear-gradient(135deg, #fff2c2, #ffd980)',
}

export function placeholderEmoji(title: string, category: MainCategory): string {
  const t = title.toLowerCase()
  for (const [re, emoji] of TITLE_EMOJI) {
    if (re.test(t)) return emoji
  }
  return CATEGORY_EMOJI[category]
}

export function placeholderGradient(category: MainCategory): string {
  return CATEGORY_GRADIENT[category]
}
