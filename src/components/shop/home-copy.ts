// The home page's fixed lists, kept out of the page so tests/shop-copy.test.ts can screen them (screenCopy and the
// voice rules) with the tier perks and the Learn guides. The landraces share their names with licensed medicines, so
// they carry origin and history only, never effects or flavour: the same words as herbalholland.com's About page.

/** Southern Africa's landraces, for the home page's heritage story. */
export const LANDRACES = [
  { name: "Durban Poison", origin: "Hills behind Durban, KwaZulu-Natal", note: "The one that travelled: its seeds left South Africa in the 1970s for the United States and Amsterdam's seed banks, and it became a global benchmark." },
  { name: "Swazi Gold", origin: "Eswatini highlands", note: "Traditionally dried in the sun on the mountain slopes, which gives it the golden colour in its name." },
  { name: "Malawi Gold", origin: "Salima, Malawi", note: "Famously patient: it can take around 120 days to flower, and was traditionally wrapped in maize leaves." },
  { name: "Mpondo Gold", origin: "Pondoland, Wild Coast", note: "From one of the country's oldest growing traditions. Some growers believe Durban Poison partly descends from Mpondo lines." },
] as const;

/** "Shop by mood": each mood's name and line, by its key in the catalogue (the page adds the icon and colour). */
export const MOODS: Record<string, { label: string; line: string }> = {
  calm: { label: "Calm", line: "Unhurried evenings and steady days" },
  focus: { label: "Focus", line: "Clear-headed routines for busy days" },
  rest: { label: "Rest", line: "A restful wind-down at day's end" },
  recover: { label: "Recover", line: "After the run, the ride or the gym" },
};
