import { useTranslation } from "react-i18next";
import { LANGUAGES } from "@game/shared";

export function LanguageSwitch() {
  const { i18n } = useTranslation();
  return (
    <div className="segmented small" role="group" aria-label="Interface language">
      {LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          aria-pressed={i18n.resolvedLanguage === language}
          onClick={() => void i18n.changeLanguage(language)}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
