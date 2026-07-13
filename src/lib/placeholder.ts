import type { MainCategory } from '../types'

// A clean stand-in for recipes without a photo: a soft gradient tinted by
// category with a dish-appropriate emoji picked from the title. Deterministic,
// self-contained (no network), and always on-brand.

const TITLE_EMOJI: [RegExp, string][] = [
  // Sauces / condiments first, so "BBQ Sauce for Chicken" isn't read as chicken.
  [/\b(sauce|gravy|dressing|hollandaise|tartar|mayonnaise|mayo|chutney|salsa|marinade)\b/, '🥫'],
  [/pancake|waffle|french toast|crumpet/, '🥞'],
  [/oat|porridge|granola|muesli|\bchia\b/, '🥣'],
  [/scotch egg/, '🥚'],
  [/\begg|frittata|shakshuka|omelet/, '🍳'],
  [/pizza/, '🍕'],
  [/burger|smash/, '🍔'],
  [/taco|fajita|nacho|quesadilla/, '🌮'],
  [/shawarma|wrap|kebab|gyro|burrito/, '🌯'],
  [/pasta|spaghetti|rigatoni|lasagne|gnocchi|macaroni|mac and cheese|mac & cheese|carbonara|pesto/, '🍝'],
  [/noodle|ramen|pad thai|chow mein|stir.?fry|singapore|lo mein/, '🍜'],
  [/risotto|paella|fried rice|nasi|biryani|\brice\b|pilaf/, '🍚'],
  [/curry|tikka|masala|rogan|katsu|korma|butter chicken|\bdh?al\b/, '🍛'],
  [/soup|chowder|bisque|broth/, '🍲'],
  [/salad|slaw|caviar/, '🥗'],
  [/sushi|poke|sashimi/, '🍣'],
  [/prawn|shrimp/, '🍤'],
  [/salmon|fish|tuna|\bcod\b|haddock/, '🐟'],
  [/\bduck\b/, '🦆'],
  [/chicken|nando|satay|coronation|marry me/, '🍗'],
  [/steak|\bbeef\b|ribs|wellington|sirloin|brisket|mince/, '🥩'],
  [/sausage|hot ?dog|toad in|chorizo|frankfurter/, '🌭'],
  [/bacon|gammon|pork|\bham\b|belly|rasher/, '🥓'],
  [/potato|mash|dauphinoise|hasselback|jacket|parmentier|parametier|chips/, '🥔'],
  [/carrot|parsnip/, '🥕'],
  [/\bpeas?\b/, '🫛'],
  [/sweetcorn|\bcorn\b/, '🌽'],
  [/mushroom/, '🍄'],
  [/broccoli|cauliflower|sprout|spinach|\bkale\b|greens/, '🥦'],
  [/yorkshire/, '🫓'],
  [/bread|dough|scone|\broll\b|\bbun\b|focaccia/, '🍞'],
  [/cake|gateau|banoffee|cheesecake|sponge/, '🍰'],
  [/brownie|chocolate|biscuit|cookie|fudge/, '🍪'],
  [/pie|crumble|\btart\b|pudding|custard/, '🥧'],
  [/pineapple/, '🍍'],
  [/banana/, '🍌'],
  [/apple/, '🍎'],
  [/lemon|lime/, '🍋'],
  [/strawberr|berry|blueberr/, '🍓'],
  [/chickpea|lentil|\bbean|falafel|tofu|quorn|vegan|hummus/, '🥘'],
  [/cheese|cheddar|halloumi/, '🧀'],
]

const CATEGORY_EMOJI: Record<MainCategory, string> = {
  Breakfast: '🍳',
  Lunch: '🥪',
  Dinner: '🍽️',
  Side: '🥔',
  Sauce: '🥫',
  Soup: '🍲',
  Salad: '🥗',
  Dessert: '🍰',
  Snack: '🥨',
}

const CATEGORY_GRADIENT: Record<MainCategory, string> = {
  Breakfast: 'linear-gradient(135deg, #ffe9c7, #ffc9a3)',
  Lunch: 'linear-gradient(135deg, #d8f2df, #a7ddb9)',
  Dinner: 'linear-gradient(135deg, #cdeede, #97d3ba)',
  Side: 'linear-gradient(135deg, #e8ecd9, #c8d6a3)',
  Sauce: 'linear-gradient(135deg, #ffe0cf, #f3b48c)',
  Soup: 'linear-gradient(135deg, #ffe4c9, #f4b98a)',
  Salad: 'linear-gradient(135deg, #ddf2c8, #aed98a)',
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
