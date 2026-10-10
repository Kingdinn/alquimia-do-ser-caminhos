import type { Locale, TranslationCatalog, TranslationValues } from "./i18n-types";
export const LANGUAGE_STORAGE_KEY = "alquimia-language";
export function isLocale(value: unknown): value is Locale {
  return value === "pt-BR" || value === "es-MX" || value === "en-US";
}
export function translate(catalog: TranslationCatalog, locale: Locale, key: string, values?: TranslationValues): string {
  const translated = locale === "pt-BR" ? key : catalog[key]?.[locale === "es-MX" ? "es" : "en"] ?? key;
  return translated.replace(/\{(\w+)\}/g, (match, name: string) => values?.[name] == null ? match : String(values[name]));
}
