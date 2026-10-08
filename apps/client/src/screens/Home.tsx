import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, MAX_SUSPECTS, MIN_SUSPECTS, type Language } from "@game/shared";
import { session } from "../net/session";
import type { RoomActions } from "../net/useRoom";

const SUSPECT_COUNTS = Array.from({ length: MAX_SUSPECTS - MIN_SUSPECTS + 1 }, (_, i) => MIN_SUSPECTS + i);

interface HomeProps {
  actions: Pick<RoomActions, "create" | "join">;
  initialRoomId?: string;
}

export function Home({ actions, initialRoomId }: HomeProps) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState(session.name() ?? "");
  const [language, setLanguage] = useState<Language>(i18n.resolvedLanguage === "ru" ? "ru" : "en");
  const [suspectCount, setSuspectCount] = useState(4);
  const [code, setCode] = useState(initialRoomId ?? "");
  const [busy, setBusy] = useState(false);

  const trimmedName = name.trim();
  const roomCode = code.trim().toUpperCase();

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const chooseLanguage = (next: Language) => {
    setLanguage(next);
    void i18n.changeLanguage(next);
  };

  return (
    <main className="home">
      <header className="home-header">
        <h1 className="title">{t("app.title")}</h1>
        <p className="tagline">{t("app.tagline")}</p>
      </header>

      <label className="field">
        <span>{t("home.name")}</span>
        <input value={name} maxLength={24} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="home-cards">
        <section className="card">
          <h2>{t("home.newCase")}</h2>
          <div className="field">
            <span>{t("home.language")}</span>
            <div className="segmented" role="group" aria-label={t("home.language")}>
              {LANGUAGES.map((option) => (
                <button key={option} type="button" aria-pressed={language === option} onClick={() => chooseLanguage(option)}>
                  {t(`lang.${option}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>{t("home.suspects")}</span>
            <div className="segmented" role="group" aria-label={t("home.suspects")}>
              {SUSPECT_COUNTS.map((count) => (
                <button key={count} type="button" aria-pressed={suspectCount === count} onClick={() => setSuspectCount(count)}>
                  {count}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="primary"
            disabled={!trimmedName || busy}
            onClick={() => run(() => actions.create({ name: trimmedName, language, suspectCount }))}
          >
            {t("home.create")}
          </button>
        </section>

        <section className="card">
          <h2>{t("home.joinTitle")}</h2>
          <input
            className="code-input"
            aria-label={t("home.joinCode")}
            placeholder={t("home.joinCode")}
            value={code}
            maxLength={8}
            onChange={(e) => setCode(e.target.value)}
          />
          <button
            type="button"
            disabled={!trimmedName || roomCode.length !== 6 || busy}
            onClick={() => run(() => actions.join(roomCode, trimmedName))}
          >
            {t("home.join")}
          </button>
        </section>
      </div>
    </main>
  );
}
