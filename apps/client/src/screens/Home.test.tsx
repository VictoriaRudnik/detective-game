import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeActions } from "../test/fixtures";
import { Home } from "./Home";

describe("Home", () => {
  it("creates a room with the chosen settings", () => {
    const actions = makeActions();
    render(<Home actions={actions} />);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "  Anna " } });
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));
    expect(actions.create).toHaveBeenCalledWith({ name: "Anna", language: "en", suspectCount: 5 });
  });

  it("needs a name before creating", () => {
    render(<Home actions={makeActions()} />);
    expect(screen.getByRole("button", { name: "Create room" })).toBeDisabled();
  });

  it("joins with a normalized 6-character code", () => {
    const actions = makeActions();
    render(<Home actions={actions} />);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Boris" } });
    const join = screen.getByRole("button", { name: "Join" });
    expect(join).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: " k7qf2x " } });
    fireEvent.click(join);
    expect(actions.join).toHaveBeenCalledWith("K7QF2X", "Boris");
  });

  it("prefills the code from an invite link", () => {
    render(<Home actions={makeActions()} initialRoomId="K7QF2X" />);
    expect(screen.getByLabelText("Room code")).toHaveValue("K7QF2X");
  });
});
