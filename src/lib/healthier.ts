import type { Recipe } from '../types'

/**
 * Built-in "make it healthier" tips: simple ingredient-swap rules that run
 * entirely on-device, so the feature works with no AI setup. The optional AI
 * worker still offers a full rewritten version on top of these.
 */

export type HealthTip = { id: string; swap: string; benefit: string }

type Rule = {
  id: string
  /** Matches the ingredient line. */
  re: RegExp
  /** Suppresses the tip when the swap has already been made. */
  unless?: RegExp
  swap: string
  benefit: string
}

const INGREDIENT_RULES: Rule[] = [
  {
    id: 'mayo',
    re: /\bmayo(nnaise)?\b/i,
    unless: /light|lighter|low[- ]fat|reduced/i,
    swap: 'Use lighter-than-light mayo, or swap half for 0% Greek yogurt.',
    benefit: 'Cuts most of the fat and calories with barely any taste change.',
  },
  {
    id: 'cream',
    re: /\b(double|heavy|whipping) cream\b/i,
    swap: 'Swap for half-fat crème fraîche or 0% Greek yogurt (stir in off the heat).',
    benefit: 'Large saturated-fat saving; slightly tangier finish.',
  },
  {
    id: 'creme-fraiche',
    re: /crème fraîche|creme fraiche/i,
    unless: /half[- ]fat|light|reduced/i,
    swap: 'Use half-fat crème fraîche.',
    benefit: 'Half the fat, works the same in cooking.',
  },
  {
    id: 'cream-cheese',
    re: /\bcream cheese\b/i,
    unless: /light|lightest|low[- ]fat|reduced/i,
    swap: 'Use light cream cheese.',
    benefit: 'Similar texture with roughly a third fewer calories.',
  },
  {
    id: 'coconut-milk',
    re: /\bcoconut (milk|cream)\b/i,
    unless: /light|reduced/i,
    swap: 'Use light coconut milk.',
    benefit: 'Around 60% less saturated fat in curries and sauces.',
  },
  {
    id: 'butter',
    re: /\bbutter\b/i,
    unless: /peanut|almond|nut butter/i,
    swap: 'Halve the butter, or cook with spray oil and add a small knob at the end for flavour.',
    benefit: 'Keeps the buttery taste while cutting saturated fat.',
  },
  {
    id: 'cheese',
    re: /\b(cheddar|mozzarella|parmesan|cheese)\b/i,
    unless: /reduced|light|low[- ]fat|cream cheese/i,
    swap: 'Use a stronger cheese (mature cheddar, parmesan) and about a third less of it.',
    benefit: 'Same cheesy hit with fewer calories, or go reduced-fat.',
  },
  {
    id: 'bacon',
    re: /\bbacon\b/i,
    unless: /medallion/i,
    swap: 'Use bacon medallions or trim visible fat before cooking.',
    benefit: 'Most of bacon’s fat is in the rind and streaks.',
  },
  {
    id: 'sausage',
    re: /\bsausages?\b/i,
    unless: /reduced|light|chicken|turkey/i,
    swap: 'Choose reduced-fat or chicken sausages.',
    benefit: 'Roughly half the fat of standard pork sausages.',
  },
  {
    id: 'mince',
    re: /\b(beef|pork|lamb)?\s*mince(d)?( beef| pork| lamb)?\b/i,
    unless: /5\s*%|lean|turkey|chicken/i,
    swap: 'Use 5% lean mince (or turkey mince).',
    benefit: 'Big saturated-fat saving; drain any fat after browning too.',
  },
  {
    id: 'chicken-thigh',
    re: /\bchicken thighs?\b/i,
    unless: /skinless/i,
    swap: 'Use skinless thighs, or swap for chicken breast.',
    benefit: 'The skin carries most of the fat.',
  },
  {
    id: 'sugar',
    re: /\b(sugar|honey|maple syrup|golden syrup)\b/i,
    swap: 'Cut the sugar/syrup by a third, most recipes don’t miss it.',
    benefit: 'Less sugar without changing the structure of the dish.',
  },
  {
    id: 'oil',
    re: /\b(olive|vegetable|sunflower|rapeseed|sesame) oil\b/i,
    unless: /spray/i,
    swap: 'Measure oil with a spoon (or use spray oil) instead of free-pouring.',
    benefit: 'A free pour is often 2–3× the calories a recipe needs.',
  },
  {
    id: 'white-rice',
    re: /\b(white |basmati |jasmine )?rice\b/i,
    unless: /brown|wholegrain|cauliflower/i,
    swap: 'Go half rice, half cauliflower rice, or switch to brown rice.',
    benefit: 'More fibre and fewer calories per plate, same sauce-soaking job.',
  },
  {
    id: 'white-pasta',
    re: /\b(pasta|spaghetti|penne|tagliatelle|fusilli|macaroni)\b/i,
    unless: /whole\s*(wheat|meal)|lentil/i,
    swap: 'Use wholewheat pasta.',
    benefit: 'Triple the fibre; keeps you full for longer.',
  },
  {
    id: 'white-bread',
    re: /\b(white bread|baguette|tortillas?|wraps?|burger buns?)\b/i,
    unless: /whole\s*(wheat|meal|grain)|seeded/i,
    swap: 'Choose wholemeal or seeded versions.',
    benefit: 'More fibre and a lower blood-sugar spike.',
  },
  {
    id: 'salt',
    re: /\b(salt|stock cubes?|soy sauce)\b/i,
    unless: /low[- ]sodium|reduced[- ]salt|light soy/i,
    swap: 'Use reduced-salt stock/soy and season with herbs, citrus or chilli instead.',
    benefit: 'Same depth of flavour with less sodium.',
  },
]

const STEP_RULES: Rule[] = [
  {
    id: 'frying',
    re: /\b(deep[- ]fry|shallow[- ]fry)\w*/i,
    swap: 'Oven-bake or air-fry instead of frying.',
    benefit: 'Same crisp finish with a fraction of the oil.',
  },
]

export function healthierTips(recipe: Recipe): HealthTip[] {
  const tips: HealthTip[] = []
  const used = new Set<string>()

  const consider = (text: string, rules: Rule[]) => {
    for (const rule of rules) {
      if (used.has(rule.id)) continue
      if (rule.re.test(text) && !rule.unless?.test(text)) {
        used.add(rule.id)
        tips.push({ id: rule.id, swap: rule.swap, benefit: rule.benefit })
      }
    }
  }

  for (const ing of recipe.ingredients) consider(ing.raw, INGREDIENT_RULES)
  for (const step of recipe.steps) consider(step.text, STEP_RULES)

  return tips.slice(0, 5)
}
