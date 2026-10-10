export type Locale = "pt-BR" | "es-MX" | "en-US";
export type TranslationCatalog = Record<string, { es: string; en: string }>;
export type TranslationValues = Record<string, string | number>;
