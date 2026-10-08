import { useTranslation } from "react-i18next";

export function Generating() {
  const { t } = useTranslation();
  return (
    <main className="generating">
      <div className="spinner" aria-hidden="true" />
      <h1 className="title">{t("generating.title")}</h1>
      <p className="hint">{t("generating.hint")}</p>
    </main>
  );
}
