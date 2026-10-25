import { useState } from "react";
import { CVD_MODES, THEMES } from "../settings/useAppearance.js";
import { OctopusIcon } from "./OctopusIcon.jsx";

// Top bar with the options menu: appearance, new conversation, sign-out and the conversation id.
export function TopBar({ menu, appearance, session, onNewConversation, onLogout }) {
  const { open: menuOpen, setOpen: setMenuOpen, ref: menuRef } = menu;
  const { themePref, setThemePref, cvd, setCvd } = appearance;
  const { user, busy, sender } = session;
  const [copied, setCopied] = useState(false);

  async function copySender() {
    try {
      await navigator.clipboard.writeText(sender);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* No clipboard here (non-secure context). */
    }
  }

  return (
    <nav className="topbar">
      <div className="brand">
        <OctopusIcon className="brand-icon" />
        <span>Octopi</span>
        <span className="brand-chip">Campus Attendance Bot</span>
      </div>

      <div className="menu-wrap" ref={menuRef}>
        <button
          type="button"
          className="top-icon-btn"
          aria-label="Options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <i className="fa-solid fa-bars" aria-hidden="true" />
        </button>

        {menuOpen && (
          <div className="menu" role="menu" aria-label="Options">
            <p className="menu-label">
              <i className="fa-solid fa-palette" aria-hidden="true" />
              Appearance
            </p>
            <div className="segmented" role="group" aria-label="Theme">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={themePref === t.id}
                  onClick={() => setThemePref(t.id)}
                >
                  <i className={`fa-solid ${t.icon}`} aria-hidden="true" />
                  {t.label}
                </button>
              ))}
            </div>

            <p className="menu-label">
              <i className="fa-solid fa-eye" aria-hidden="true" />
              Colour vision
            </p>
            <div className="cvd" role="group" aria-label="Colour-vision mode">
              {CVD_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="cvd-option"
                  aria-pressed={cvd === m.id}
                  onClick={() => setCvd(m.id)}
                >
                  <span className="cvd-label">{m.label}</span>
                  <span className="cvd-hint">{m.hint}</span>
                </button>
              ))}
            </div>

            {user && (
              <>
                <hr />

                <button
                  type="button"
                  className="menu-action"
                  onClick={onNewConversation}
                  disabled={busy}
                >
                  <i className="fa-solid fa-rotate-right" aria-hidden="true" />
                  Start a new conversation
                </button>

                <hr />

                <p className="menu-label">
                  <i className="fa-solid fa-user" aria-hidden="true" />
                  Signed in as {user.first} {user.last}
                </p>
                <button
                  type="button"
                  className="menu-action"
                  onClick={onLogout}
                  disabled={busy}
                >
                  <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
                  Log out
                </button>
              </>
            )}

            <hr />

            <p className="menu-label">
              <i className="fa-solid fa-fingerprint" aria-hidden="true" />
              Conversation ID
            </p>
            <div className="conv-id">
              <code title={sender}>{sender}</code>
              <button
                type="button"
                className={`conv-copy${copied ? " copied" : ""}`}
                aria-label="Copy conversation ID"
                onClick={copySender}
              >
                <i
                  className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`}
                  aria-hidden="true"
                />
              </button>
            </div>
            <p className="conv-hint">
              Identifies this conversation in the logs — quote it when
              debugging.
            </p>
          </div>
        )}
      </div>
    </nav>
  );
}
