import { useEffect, useRef, useState } from "react";
import { readStoredUser } from "./storage/session.js";
import { useAppearance } from "./settings/useAppearance.js";
import { useVoiceInput } from "./voice/useVoiceInput.js";
import { useChat } from "./chat/useChat.js";
import { useAuth } from "./auth/useAuth.js";
import { TopBar } from "./components/TopBar.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { PageIntro } from "./components/PageIntro.jsx";
import { LoginCard } from "./components/LoginCard.jsx";
import { Messages } from "./components/Messages.jsx";
import { Composer } from "./components/Composer.jsx";

export default function App() {
  const appearance = useAppearance();
  const [user, setUser] = useState(readStoredUser);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bottomRef = useRef(null);
  const menuRef = useRef(null);

  const closeMenu = () => setMenuOpen(false);
  const voice = useVoiceInput({ input, setInput, busy });
  const expireRef = useRef(() => {});
  const chat = useChat({
    user,
    busy,
    setBusy,
    stopDictation: voice.stopListening,
    closeMenu,
    onSessionExpired: () => expireRef.current(),
  });
  const auth = useAuth({ setUser, setInput, chat, voice, closeMenu });
  expireRef.current = auth.expireSession;

  const lastMessage = chat.messages[chat.messages.length - 1];
  const showQuickReplies =
    user && !busy && lastMessage?.from === "bot" && !lastMessage.buttons?.length;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "end",
    });
  }, [chat.messages, busy]);

  // Close the menu on click outside / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function newConversation() {
    closeMenu();
    voice.stopListening();
    voice.clearSpeechHint();
    chat.startNewConversation();
    setInput("");
  }

  function onSubmit(e) {
    e.preventDefault();
    chat.sendMessage(input);
    setInput("");
  }

  return (
    <div className="page">
      <TopBar
        menu={{ open: menuOpen, setOpen: setMenuOpen, ref: menuRef }}
        appearance={appearance}
        session={{ user, busy, sender: chat.sender }}
        onNewConversation={newConversation}
        onLogout={auth.logout}
      />

      <div className="layout">
        <Sidebar
          busy={busy}
          user={user}
          onAsk={(message) => chat.sendMessage(message)}
          onNewConversation={newConversation}
        />

        <main className="content">
          <div className="content-inner">
            <PageIntro demoMode={chat.demoMode} />

            {!user ? (
              <LoginCard
                name={auth.loginName}
                setName={auth.setLoginName}
                password={auth.loginPassword}
                setPassword={auth.setLoginPassword}
                error={auth.loginError}
                busy={auth.loginBusy}
                onSubmit={auth.onLogin}
              />
            ) : (
              <>
                <h2 className="section-title">Conversation</h2>

                <Messages
                  messages={chat.messages}
                  busy={busy}
                  showQuickReplies={showQuickReplies}
                  onQuickReply={(q) => chat.sendMessage(q)}
                  onChoose={(b) => chat.sendMessage(b.payload, { label: b.title })}
                  bottomRef={bottomRef}
                />

                {voice.speechHint && (
                  <p className="speech-hint" role="status">
                    <i className="fa-solid fa-circle-info" aria-hidden="true" />
                    {voice.speechHint}
                  </p>
                )}

                <Composer
                  input={input}
                  setInput={setInput}
                  onSubmit={onSubmit}
                  busy={busy}
                  transcribing={voice.transcribing}
                  listening={voice.listening}
                  voiceMode={voice.voiceMode}
                  onToggleMic={voice.toggleListening}
                />
              </>
            )}

            <footer className="footer">
              Octopi · Built with Rasa Open Source · React 19 + Vite · SQLite /
              Neon Postgres
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
