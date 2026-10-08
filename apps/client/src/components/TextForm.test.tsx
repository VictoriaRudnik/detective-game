import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextForm } from "./TextForm";

describe("TextForm", () => {
  it("submits trimmed text and clears the field", () => {
    const onSubmit = vi.fn();
    render(<TextForm label="Message" submitLabel="Send" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "  hello  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledWith("hello");
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("cannot submit blank text", () => {
    render(<TextForm label="Message" submitLabel="Send" onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("can be disabled", () => {
    render(<TextForm label="Message" submitLabel="Send" disabled onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
