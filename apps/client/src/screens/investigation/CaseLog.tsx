import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { LogEntry, PublicRoomView } from "@game/shared";

interface CaseLogProps {
  view: PublicRoomView;
  deltas: Record<string, string>;
}

export function CaseLog({ view, deltas }: CaseLogProps) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);
  const playerName = new Map(view.players.map((p) => [p.id, p.name]));
  const suspectName = new Map(view.case?.suspects.map((s) => [s.id, s.name]) ?? []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [view.log.length, deltas]);

  const render = (entry: LogEntry) => {
    switch (entry.kind) {
      case "question":
        return (
          <>
            <span className="who">
              {t("inv.asks", { player: playerName.get(entry.playerId), suspect: suspectName.get(entry.suspectId) })}
            </span>
            <p>{entry.text}</p>
          </>
        );
      case "answer": {
        const streaming = view.pendingAnswer?.entryId === entry.id;
        const text = streaming ? (deltas[entry.id] ?? "") : entry.text;
        const name = suspectName.get(entry.suspectId);
        return (
          <>
            <span className="who suspect">{name}</span>
            <p>
              {text || (streaming ? t("inv.answering", { name }) : "")}
              {streaming && <span className="cursor" aria-hidden="true" />}
            </p>
          </>
        );
      }
      case "chat":
        return (
          <>
            <span className="who">{playerName.get(entry.playerId)}</span>
            <p>{entry.text}</p>
          </>
        );
      case "system":
        return <p>{t(`system.${entry.code}`)}</p>;
    }
  };

  return (
    <div className="log" aria-live="polite">
      {view.log.map((entry) => (
        <div key={entry.id} className={`log-entry log-${entry.kind}`}>
          {render(entry)}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
