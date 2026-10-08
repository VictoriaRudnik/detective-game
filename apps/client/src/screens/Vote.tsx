import { useTranslation } from "react-i18next";
import { SuspectList } from "../components/SuspectList";
import { CaseLog } from "./investigation/CaseLog";
import type { ScreenProps } from "./types";

/** No answer streams during a vote: every log entry already holds its final text. */
const NO_DELTAS: Record<string, string> = {};

export function Vote({ view, playerId, actions }: ScreenProps) {
  const { t } = useTranslation();
  const ballots = view.vote?.ballots ?? {};

  return (
    <main className="vote">
      <h1 className="title">{t("vote.title")}</h1>
      <p className="hint">{view.vote?.forced ? t("vote.forced") : t("vote.hint")}</p>
      {/* The vote can start the moment the last answer arrives, so the testimony stays readable here. */}
      <section className="vote-record">
        <h2>{t("vote.record")}</h2>
        <CaseLog view={view} deltas={NO_DELTAS} />
      </section>
      <SuspectList suspects={view.case?.suspects ?? []} selectedId={ballots[playerId]} onSelect={actions.castVote} />
      <ul className="players">
        {view.players
          .filter((player) => player.connected)
          .map((player) => (
            <li key={player.id}>
              <span>{player.name}</span>
              <span className="tag">{ballots[player.id] ? t("vote.voted") : t("vote.waiting")}</span>
            </li>
          ))}
      </ul>
    </main>
  );
}
