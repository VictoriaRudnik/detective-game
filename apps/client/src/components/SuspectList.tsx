import { useTranslation } from "react-i18next";
import type { PublicSuspect } from "@game/shared";

interface SuspectListProps {
  suspects: PublicSuspect[];
  selectedId?: string;
  answeringId?: string;
  /** Omit to show the cards read-only. */
  onSelect?(suspectId: string): void;
}

export function SuspectList({ suspects, selectedId, answeringId, onSelect }: SuspectListProps) {
  const { t } = useTranslation();
  return (
    <section className="suspects">
      <h2>{t("inv.suspects")}</h2>
      <ul>
        {suspects.map((suspect) => (
          <li key={suspect.id}>
            <button
              type="button"
              className={[
                "suspect-card",
                suspect.id === selectedId && "selected",
                suspect.id === answeringId && "answering",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={suspect.id === selectedId}
              disabled={!onSelect}
              onClick={() => onSelect?.(suspect.id)}
            >
              <span className="suspect-name">{suspect.name}</span>
              <span className="suspect-role">{suspect.role}</span>
              <span className="suspect-desc">{suspect.publicDescription}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
