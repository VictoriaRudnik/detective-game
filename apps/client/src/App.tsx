import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ErrorToast } from "./components/ErrorToast";
import { LanguageSwitch } from "./components/LanguageSwitch";
import { roomIdFromPath } from "./net/roomPath";
import { session } from "./net/session";
import { useRoom } from "./net/useRoom";
import { Generating } from "./screens/Generating";
import { Home } from "./screens/Home";
import { Investigation } from "./screens/investigation/Investigation";
import { Lobby } from "./screens/Lobby";
import { Reveal } from "./screens/Reveal";
import type { ScreenProps } from "./screens/types";
import { Vote } from "./screens/Vote";

export function App() {
  const { t, i18n } = useTranslation();
  const { view, playerId, deltas, error, connected, dismissError, actions } = useRoom();
  const invitedRoomId = useMemo(() => roomIdFromPath(window.location.pathname), []);
  const triedAutoJoin = useRef(false);

  // Reopening /room/CODE (reload, or the invite link again) with a remembered name rejoins silently.
  useEffect(() => {
    const name = session.name();
    if (!connected || view || !invitedRoomId || !name || triedAutoJoin.current) return;
    triedAutoJoin.current = true;
    void actions.join(invitedRoomId, name).then((joinError) => {
      if (joinError === "ROOM_NOT_FOUND") window.history.replaceState(null, "", "/");
    });
  }, [connected, view, invitedRoomId, actions]);

  // Inside a room the UI is locked to the room's language: the case text itself is generated in that
  // language, so a different UI language would mix the two on every screen.
  useEffect(() => {
    if (view?.language) void i18n.changeLanguage(view.language);
  }, [view?.language, i18n]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">{t("app.title")}</span>
        {!view && <LanguageSwitch />}
      </header>

      {view && playerId ? (
        <Screen view={view} playerId={playerId} actions={actions} deltas={deltas} />
      ) : (
        <Home actions={actions} initialRoomId={invitedRoomId} />
      )}

      {view && !connected && (
        <div className="banner" role="status">
          {t("errors.CONNECTION")}
        </div>
      )}
      <ErrorToast code={error} onDismiss={dismissError} />
    </div>
  );
}

function Screen({ deltas, ...props }: ScreenProps & { deltas: Record<string, string> }) {
  switch (props.view.phase) {
    case "lobby":
      return <Lobby {...props} />;
    case "generating":
      return <Generating />;
    case "investigating":
      return <Investigation {...props} deltas={deltas} />;
    case "voting":
      return <Vote {...props} />;
    case "revealed":
      return <Reveal {...props} />;
  }
}
