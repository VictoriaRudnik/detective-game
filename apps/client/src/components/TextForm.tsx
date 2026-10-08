import { useState } from "react";
import { MAX_TEXT_LENGTH } from "@game/shared";

interface TextFormProps {
  /** Used as both the placeholder and the accessible label. */
  label: string;
  submitLabel: string;
  disabled?: boolean;
  onSubmit(text: string): void;
}

export function TextForm({ label, submitLabel, disabled = false, onSubmit }: TextFormProps) {
  const [text, setText] = useState("");
  const trimmed = text.trim();

  return (
    <form
      className="text-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed || disabled) return;
        onSubmit(trimmed);
        setText("");
      }}
    >
      <input
        aria-label={label}
        placeholder={label}
        value={text}
        maxLength={MAX_TEXT_LENGTH}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" disabled={disabled || !trimmed}>
        {submitLabel}
      </button>
    </form>
  );
}
