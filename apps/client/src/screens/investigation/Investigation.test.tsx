import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeActions, makeView } from "../../test/fixtures";
import { Investigation } from "./Investigation";

describe("Investigation", () => {
  it("lets the active player pick a suspect and ask", () => {
    const actions = makeActions();
    render(<Investigation view={makeView()} playerId="p1" actions={actions} deltas={{}} />);
    expect(screen.getByLabelText("Choose a suspect first")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Margaret Hale/ }));
    fireEvent.change(screen.getByLabelText("Ask Margaret Hale…"), { target: { value: "Where were you?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(actions.ask).toHaveBeenCalledWith("s1", "Where were you?");
  });

  it("tells other players whose turn it is", () => {
    render(<Investigation view={makeView()} playerId="p2" actions={makeActions()} deltas={{}} />);
    expect(screen.getByText("Waiting for Anna to ask…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask" })).not.toBeInTheDocument();
  });

  it("shows the moves left and lets anyone call a vote", () => {
    const actions = makeActions();
    render(<Investigation view={makeView({ movesLeft: 7 })} playerId="p2" actions={actions} deltas={{}} />);
    expect(screen.getByText("Questions left: 7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Call a vote" }));
    expect(actions.proposeVote).toHaveBeenCalled();
  });

  it("streams the pending answer and blocks votes meanwhile", () => {
    const view = makeView({
      log: [
        { kind: "question", id: "q1", ts: 1, playerId: "p1", suspectId: "s2", text: "Where?" },
        { kind: "answer", id: "a1", ts: 1, suspectId: "s2", text: "" },
      ],
      pendingAnswer: { suspectId: "s2", entryId: "a1" },
    });
    render(<Investigation view={view} playerId="p2" actions={makeActions()} deltas={{ a1: "In the drawing" }} />);
    expect(screen.getByText("Anna → Dr. Arthur Finch")).toBeInTheDocument();
    expect(screen.getByText(/In the drawing/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Call a vote" })).toBeDisabled();
  });

  it("translates system messages and shows chat", () => {
    const view = makeView({
      log: [
        { kind: "chat", id: "c1", ts: 1, playerId: "p2", text: "It's the wife!" },
        { kind: "system", id: "s1", ts: 2, code: "VOTE_TIED" },
      ],
    });
    render(<Investigation view={view} playerId="p1" actions={makeActions()} deltas={{}} />);
    expect(screen.getByText("It's the wife!")).toBeInTheDocument();
    expect(screen.getByText("The vote is tied. The investigation continues.")).toBeInTheDocument();
  });
});
