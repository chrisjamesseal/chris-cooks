import { FOOD_ICON_SVG } from '../lib/foodIcons.generated'

// Renders a bundled Fluent Emoji (flat) SVG for the given emoji so food icons
// look identical on every device. Sized via font-size on the parent (1em box).
// Falls back to the raw emoji if no matching icon is bundled.
export function FoodIcon({ emoji, className }: { emoji: string; className?: string }) {
  const svg = FOOD_ICON_SVG[emoji]
  const cls = className ? `food-icon ${className}` : 'food-icon'
  if (!svg) {
    return (
      <span className={cls} aria-hidden="true">
        {emoji}
      </span>
    )
  }
  return <span className={cls} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
}
