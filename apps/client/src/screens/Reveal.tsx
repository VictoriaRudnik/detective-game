import { useTranslation } from "react-i18next";
import type { ScreenProps } from "./types";

export function Reveal({ view, playerId, actions }: ScreenProps) {
  const { t } = useTranslation();
  const full = view.reveal;
  const result = view.result;
  if (!full || !result) return null;

  const nameOf = (suspectId: string) => full.suspects.find((s) => s.id === suspectId)?.name ?? suspectId;

  return (
    <main className="reveal">
      <h1 className={`title verdict ${result.correct ? "correct" : "wrong"}`}>
        {result.correct ? t("reveal.correct") : t("reveal.wrong")}
      </h1>
      <p className="hint">{t("reveal.accused", { name: nameOf(result.accusedId) })}</p>

      <section className="card solution">
        <h2>{t("reveal.killer", { name: nameOf(full.solution.killerId) })}</h2>
        <dl>
          <div>
            <dt>{t("reveal.method")}</dt>
            <dd>{full.solution.method}</dd>
          </div>
          <div>
            <dt>{t("reveal.motive")}</dt>
            <dd>{full.solution.motive}</dd>
          </div>
        </dl>
        <h3>{t("reveal.evidence")}</h3>
        <ul>
          {full.solution.keyEvidence.map((evidence) => (
            <li key={evidence}>{evidence}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>{t("reveal.secrets")}</h2>
        <ul className="secrets">
          {full.suspects.map((suspect) => (
            <li key={suspect.id}>
              <strong>{suspect.name}</strong> — {suspect.role}
              <p>
                <em>{t("reveal.secret")}:</em> <span>{suspect.secret}</span>
              </p>
              <p>
                <em>{t("reveal.truth")}:</em> <span>{suspect.alibi.truth}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      {view.hostId === playerId ? (
        <button type="button" className="primary" onClick={() => actions.restart()}>
          {t("reveal.newCase")}
        </button>
      ) : (
        <p className="hint">{t("reveal.waitingHost")}</p>
      )}
    </main>
  );
}
