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

  it("explains a forced vote", () => {
    render(<Vote view={makeView({ phase: "voting", vote: { ballots: {}, forced: true } })} playerId="p1" actions={makeActions()} />);
    expect(screen.getByText("You are out of questions. You must decide now.")).toBeInTheDocument();
  });
});
