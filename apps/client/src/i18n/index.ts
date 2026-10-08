import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { session } from "../net/session";
import en from "./en.json";
import ru from "./ru.json";

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru } },
  lng: session.uiLanguage() ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React already escapes
});
i18n.on("languageChanged", (language) => session.setUiLanguage(language));

export default i18n;
