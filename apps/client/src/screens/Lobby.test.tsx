import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeActions, makeView } from "../test/fixtures";
import { Lobby } from "./Lobby";

const lobbyView = makeView({ phase: "lobby", case: undefined, movesLeft: 0, turnPlayerId: undefined });

describe("Lobby", () => {
  it("shows the code, the players and lets the host start", () => {
    const actions = makeActions();
    render(<Lobby view={lobbyView} playerId="p1" actions={actions} />);
    expect(screen.getByText("K7QF2X")).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Boris")).toBeInTheDocument();
    expect(screen.getByText(/shares 12 questions/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start the investigation" }));
    expect(actions.start).toHaveBeenCalled();
  });

  it("makes guests wait for the host", () => {
    render(<Lobby view={lobbyView} playerId="p2" actions={makeActions()} />);
    expect(screen.queryByRole("button", { name: "Start the investigation" })).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for the host to start…")).toBeInTheDocument();
  });
});
