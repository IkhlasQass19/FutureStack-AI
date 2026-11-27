import { useEffect, useRef } from "react";
import { Sparkles, X } from "lucide-react";
import type { Style } from "../app/types";
export default function BriefDialog({
  brief,
  setBrief,
  style,
  setStyle,
  submit,
  close,
  busy,
  error,
}: {
  brief: string;
  setBrief: (s: string) => void;
  style: Style;
  setStyle: (s: Style) => void;
  submit: () => void;
  close: () => void;
  busy: boolean;
  error: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="brief-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      onClick={(e) => {
        if (!busy && e.target === ref.current) close();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="brief-form"
      >
        <div className="section-title">
          <Sparkles size={19} />
          <h2 id="brief-title">Design from a brief</h2>
          <button
            type="button"
            aria-label="Close brief"
            className="icon-btn right"
            onClick={close}
            disabled={busy}
          >
            <X size={17} />
          </button>
        </div>
        <label>
          Business brief
          <textarea
            autoFocus
            value={brief}
            maxLength={6000}
            onChange={(e) => setBrief(e.target.value)}
          />
        </label>
        <label>
          Architecture style
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as Style)}
          >
            {["microservices", "monolith", "event-driven"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="primary"
          disabled={busy || brief.trim().length < 12}
        >
          <Sparkles size={15} />
          {busy ? "Generating design…" : "Generate and review"}
        </button>
      </form>
    </dialog>
  );
}
