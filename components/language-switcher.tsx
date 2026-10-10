"use client";
import {useI18n} from "@/lib/i18n";
import type {Locale} from "@/lib/i18n-types";
const languages: {locale: Locale; flag: string; name: string; short: string}[] = [
  {locale: "en-US", flag: "🇺🇸", name: "English", short: "EN"},
  {locale: "es-MX", flag: "🇲🇽", name: "Español", short: "ES"},
  {locale: "pt-BR", flag: "🇧🇷", name: "Português", short: "PT"},
];
export default function LanguageSwitcher() {
 const {locale, setLocale, t} = useI18n();
 return <div className="language-switcher" role="group" aria-label={t("Idioma")}>
  {languages.map(language => <button key={language.locale} type="button" aria-label={language.name} title={language.name} lang={language.locale} aria-pressed={locale === language.locale} onClick={() => setLocale(language.locale)}><span aria-hidden="true">{language.flag}</span><span className="language-code">{language.short}</span></button>)}
 </div>;
}
