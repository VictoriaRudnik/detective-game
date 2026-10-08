import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeActions, makeView } from "../test/fixtures";
import { Vote } from "./Vote";

describe("Vote", () => {
  it("casts a ballot for the chosen suspect", () => {
    const actions = makeActions();
    render(<Vote view={makeView({ phase: "voting", vote: { ballots: {}, forced: false } })} playerId="p1" actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: /Margaret Hale/ }));
    expect(actions.castVote).toHaveBeenCalledWith("s1");
  });

  it("shows who has voted and marks my ballot", () => {
    const view = makeView({ phase: "voting", vote: { ballots: { p1: "s2" }, forced: false } });
    render(<Vote view={view} playerId="p1" actions={makeActions()} />);
    expect(screen.getByRole("button", { name: /Dr. Arthur Finch/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("voted")).toBeInTheDocument();
    expect(screen.getByText("thinking…")).toBeInTheDocument();
  });

  it("shows the interrogation record, including the last answer, while voting", () => {
    const view = makeView({
      phase: "voting",
      movesLeft: 0,
      vote: { ballots: {}, forced: true },
      log: [
        { id: "q15", kind: "question", playerId: "p1", suspectId: "s2", text: "Where were you at midnight?", ts: 1 },
        { id: "a15", kind: "answer", suspectId: "s2", text: "In the library, alone with my thoughts.", ts: 2 },
        { id: "sys", kind: "system", code: "FORCED_VOTE", ts: 3 },
      ],
    });
    render(<Vote view={view} playerId="p1" actions={makeActions()} />);
    expect(screen.getByRole("heading", { name: "Interrogation record" })).toBeInTheDocument();
    expect(screen.getByText("Where were you at midnight?")).toBeInTheDocument();
    expect(screen.getByText("In the library, alone with my thoughts.")).toBeInTheDocument();
  });

  it("explains a forced vote", () => {
    render(<Vote view={makeView({ phase: "voting", vote: { ballots: {}, forced: true } })} playerId="p1" actions={makeActions()} />);
    expect(screen.getByText("You are out of questions. You must decide now.")).toBeInTheDocument();
  });
});
