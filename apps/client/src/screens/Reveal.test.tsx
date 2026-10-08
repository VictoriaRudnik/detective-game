import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fullCase, makeActions, makeView } from "../test/fixtures";
import { Reveal } from "./Reveal";

const revealed = (correct: boolean, accusedId: string) =>
  makeView({ phase: "revealed", result: { accusedId, correct }, reveal: fullCase });

describe("Reveal", () => {
  it("celebrates a correct accusation and explains the solution", () => {
    render(<Reveal view={revealed(true, "s1")} playerId="p1" actions={makeActions()} />);
    expect(screen.getByText("Case closed! You caught the killer.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The killer: Margaret Hale" })).toBeInTheDocument();
    expect(screen.getByText(fullCase.solution.motive)).toBeInTheDocument();
    for (const suspect of fullCase.suspects) expect(screen.getByText(suspect.secret)).toBeInTheDocument();
  });

  it("names the wrongly accused suspect", () => {
    render(<Reveal view={revealed(false, "s2")} playerId="p1" actions={makeActions()} />);
    expect(screen.getByText("Wrong suspect. The killer walks free.")).toBeInTheDocument();
    expect(screen.getByText("You accused Dr. Arthur Finch.")).toBeInTheDocument();
  });

  it("lets only the host start a new case", () => {
    const actions = makeActions();
    const { unmount } = render(<Reveal view={revealed(true, "s1")} playerId="p1" actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "New case" }));
    expect(actions.restart).toHaveBeenCalled();
    unmount();

    render(<Reveal view={revealed(true, "s1")} playerId="p2" actions={makeActions()} />);
    expect(screen.queryByRole("button", { name: "New case" })).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for the host to start a new case…")).toBeInTheDocument();
  });
});
