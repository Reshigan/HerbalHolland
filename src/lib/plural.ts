import { num } from "./format";

/** "1 unit", "12 units", "1,204 deliveries": a count with its noun in the right number. */
export const plural = (n: number, word: string, many = `${word}s`) => `${num(n)} ${Math.abs(n) === 1 ? word : many}`;
