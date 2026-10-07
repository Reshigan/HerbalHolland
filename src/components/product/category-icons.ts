// The icons a category can wear: one set for the storefront's category tiles, the till's category rail and the HQ
// Categories screen, so whatever HQ picks renders everywhere. Category.icon stores the key.
import {
  Apple,
  Bath,
  Candy,
  Cigarette,
  Coffee,
  Cookie,
  CupSoda,
  Droplet,
  Droplets,
  Dumbbell,
  Flower2,
  Gift,
  GlassWater,
  HandHeart,
  Leaf,
  Moon,
  Package,
  Shirt,
  Sparkles,
  Sprout,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICONS = {
  Flower2,
  Cigarette,
  Cookie,
  Wind,
  Droplet,
  Leaf,
  Sparkles,
  Sprout,
  Shirt,
  Coffee,
  CupSoda,
  GlassWater,
  Dumbbell,
  Apple,
  HandHeart,
  Droplets,
  Bath,
  Candy,
  Gift,
  Package,
  Sun,
  Moon,
} satisfies Record<string, LucideIcon>;

export type CategoryIconName = keyof typeof CATEGORY_ICONS;
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS) as CategoryIconName[];

/** What each icon shows, for the picker's labels and screen readers. */
export const CATEGORY_ICON_LABEL: Record<CategoryIconName, string> = {
  Flower2: "Flower",
  Cigarette: "Pre-roll",
  Cookie: "Cookie",
  Wind: "Vapour",
  Droplet: "Drop",
  Leaf: "Leaf",
  Sparkles: "Sparkles",
  Sprout: "Sprout",
  Shirt: "Shirt",
  Coffee: "Coffee cup",
  CupSoda: "Drink",
  GlassWater: "Glass",
  Dumbbell: "Dumbbell",
  Apple: "Apple",
  HandHeart: "Hand and heart",
  Droplets: "Drops",
  Bath: "Bath",
  Candy: "Sweet",
  Gift: "Gift",
  Package: "Package",
  Sun: "Sun",
  Moon: "Moon",
};

export const isCategoryIcon = (name: string): name is CategoryIconName => Object.hasOwn(CATEGORY_ICONS, name);

/** The icon for a stored key, or the fallback for keys from before this set (or typos in old data). */
export const categoryIcon = (name: string, fallback: LucideIcon = Leaf): LucideIcon => (isCategoryIcon(name) ? CATEGORY_ICONS[name] : fallback);
