import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SuspectList } from "../../components/SuspectList";
import { TextForm } from "../../components/TextForm";
import type { ScreenProps } from "../types";
import { Briefing } from "./Briefing";
import { CaseLog } from "./CaseLog";

export function Investigation({ view, playerId, actions, deltas }: ScreenProps & { deltas: Record<string, string> }) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>();
  const publicCase = view.case;
  if (!publicCase) return null;

  const myTurn = view.turnPlayerId === playerId;
  const answering = view.pendingAnswer !== undefined;
  const selected = publicCase.suspects.find((s) => s.id === selectedId);
  const turnPlayer = view.players.find((p) => p.id === view.turnPlayerId);

  return (
    <main className="investigation">
      <aside className="dossier">
        <Briefing title={publicCase.title} briefing={publicCase.briefing} />
        <SuspectList
          suspects={publicCase.suspects}
          selectedId={myTurn ? selectedId : undefined}
          answeringId={view.pendingAnswer?.suspectId}
          onSelect={myTurn ? setSelectedId : undefined}
        />
      </aside>

      <section className="board">
        <header className="board-header">
          <span className="moves">{t("inv.moves", { count: view.movesLeft })}</span>
          <button type="button" className="accuse" disabled={answering} onClick={() => actions.proposeVote()}>
            {t("inv.accuse")}
          </button>
        </header>

        <CaseLog view={view} deltas={deltas} />

        <div className="turn">
          {myTurn ? (
            <>
              <p className="turn-hint">{t("inv.yourTurn")}</p>
              <TextForm
                label={selected ? t("inv.askPlaceholder", { name: selected.name }) : t("inv.chooseSuspect")}
                submitLabel={t("inv.ask")}
                disabled={!selected || answering}
                onSubmit={(text) => selected && actions.ask(selected.id, text)}
              />
            </>
          ) : (
            <p className="turn-hint">{t("inv.waitingFor", { name: turnPlayer?.name ?? "…" })}</p>
          )}
        </div>

        <TextForm label={t("inv.chatPlaceholder")} submitLabel={t("inv.send")} onSubmit={actions.chat} />
      </section>
    </main>
  );
}
