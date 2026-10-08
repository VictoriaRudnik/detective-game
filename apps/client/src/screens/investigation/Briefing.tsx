import { useTranslation } from "react-i18next";
import type { Briefing as BriefingData } from "@game/shared";

export function Briefing({ title, briefing }: { title: string; briefing: BriefingData }) {
  const { t } = useTranslation();
  const rows: Array<[string, string]> = [
    [t("inv.victim"), briefing.victim],
    [t("inv.location"), briefing.location],
    [t("inv.time"), briefing.timeOfDeath],
    [t("inv.cause"), briefing.causeOfDeath],
  ];
  return (
    <section className="card briefing">
      <h2>{title}</h2>
      <p className="setting">{briefing.setting}</p>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
