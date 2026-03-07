import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

// Detect language from localStorage or system
const savedLang = localStorage.getItem("mlf-lang");
const systemLang = navigator.language.startsWith("zh") ? "zh" : "en";
const defaultLang = savedLang || systemLang;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: defaultLang,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
