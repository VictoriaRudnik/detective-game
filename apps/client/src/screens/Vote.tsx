import { useTranslation } from "react-i18next";
import { SuspectList } from "../components/SuspectList";
import type { ScreenProps } from "./types";

export function Vote({ view, playerId, actions }: ScreenProps) {
  const { t } = useTranslation();
  const ballots = view.vote?.ballots ?? {};

  return (
    <main className="vote">
      <h1 className="title">{t("vote.title")}</h1>
      <p className="hint">{view.vote?.forced ? t("vote.forced") : t("vote.hint")}</p>
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
