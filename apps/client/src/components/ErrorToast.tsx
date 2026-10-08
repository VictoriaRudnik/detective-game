import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { GameErrorCode } from "@game/shared";

export function ErrorToast({ code, onDismiss }: { code?: GameErrorCode; onDismiss(): void }) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!code) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [code, onDismiss]);

  if (!code) return null;
  return (
    <button type="button" className="toast" role="alert" onClick={onDismiss}>
      {t(`errors.${code}`)}
    </button>
  );
}
