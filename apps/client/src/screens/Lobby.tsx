import { useState } from "react";
import { useTranslation } from "react-i18next";
import { movesForSuspectCount } from "@game/shared";
import { roomUrl } from "../net/roomPath";
import type { ScreenProps } from "./types";

export function Lobby({ view, playerId, actions }: ScreenProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isHost = view.hostId === playerId;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl(view.id));
      setCopied(true);
    } catch {
      // Clipboard can be blocked (e.g. plain http on a LAN); the code is on screen to share by hand.
    }
  };

  return (
    <main className="lobby">
      <h1 className="title">{t("lobby.title")}</h1>

      <section className="card room-code">
        <span className="label">{t("lobby.code")}</span>
        <strong className="code">{view.id}</strong>
        <button type="button" onClick={copyLink}>
          {copied ? t("lobby.copied") : t("lobby.copyLink")}
        </button>
      </section>

      <section className="card">
        <h2>{t("lobby.players")}</h2>
        <ul className="players">
          {view.players.map((player) => (
            <li key={player.id} className={player.connected ? undefined : "offline"}>
              <span>{player.name}</span>
              {player.id === view.hostId && <span className="tag">{t("lobby.host")}</span>}
              {player.id === playerId && <span className="tag">{t("lobby.you")}</span>}
              {!player.connected && <span className="tag">{t("lobby.offline")}</span>}
            </li>
          ))}
        </ul>
      </section>

      <p className="rules">{t("lobby.rules", { moves: movesForSuspectCount(view.suspectCount) })}</p>

      {isHost ? (
        <button type="button" className="primary" onClick={() => actions.start()}>
          {t("lobby.start")}
        </button>
      ) : (
        <p className="hint">{t("lobby.waitingHost")}</p>
      )}
    </main>
  );
}
