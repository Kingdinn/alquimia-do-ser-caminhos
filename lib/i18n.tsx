"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Locale, TranslationValues } from "./i18n-types";
import { authTranslations } from "./i18n-auth";
import { coreTranslations } from "./i18n-core";
import { planningTranslations } from "./i18n-planning";
import { experienceTranslations } from "./i18n-experience";
import { supportTranslations } from "./i18n-support";
import { isLocale, LANGUAGE_STORAGE_KEY, translate } from "./translate";
const catalog = { ...coreTranslations, ...authTranslations, ...planningTranslations, ...experienceTranslations, ...supportTranslations };
type I18n = {locale: Locale; setLocale: (locale: Locale) => void; t: (key: string, values?: TranslationValues) => string};
const Context = createContext<I18n>({locale: "pt-BR", setLocale: () => {}, t: (key, values) => translate(catalog, "pt-BR", key, values)});
export function I18nProvider({children}: {children: React.ReactNode}) {
  const [locale, updateLocale] = useState<Locale>("pt-BR");
  useEffect(() => {
    try { const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY); if (isLocale(saved)) updateLocale(saved); } catch {}
    const onStorage = (event: StorageEvent) => { if (event.key === LANGUAGE_STORAGE_KEY && isLocale(event.newValue)) updateLocale(event.newValue); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {document.documentElement.lang = locale;}, [locale]);
  const setLocale = useCallback((next: Locale) => {updateLocale(next); try {localStorage.setItem(LANGUAGE_STORAGE_KEY, next);} catch {}}, []);
  const t = useCallback((key: string, values?: TranslationValues) => translate(catalog, locale, key, values), [locale]);
  const value = useMemo(() => ({locale, setLocale, t}), [locale, setLocale, t]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n() { return useContext(Context); }
export function Trans({text}: {text: string}) { const {t} = useI18n(); return <>{t(text)}</>; }
