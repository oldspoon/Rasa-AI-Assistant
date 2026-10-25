// Page heading, badges and the demo-mode notice.
export function PageIntro({ demoMode }) {
  return (
    <>
      <p className="crumbs">
        <span>React Web Chat</span>
        <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        <span>Octopi</span>
      </p>

      <h1 className="page-title">Ask Octopi</h1>

      <p className="lede">
        Log in with your student username and password, then ask Octopi
        about your lecture and practical sessions — campus, day, time,
        subject and room.
      </p>

      <div className="badges">
        <span className="badge">
          <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
          Student records
        </span>
        <span className="badge">
          <i className="fa-solid fa-gears" aria-hidden="true" />
          Rasa 3.6
        </span>
        <span className="badge">
          <i className="fa-solid fa-plug" aria-hidden="true" />
          REST channel
        </span>
        <span className="badge">
          <i className="fa-solid fa-database" aria-hidden="true" />
          SQLite / Neon
        </span>
      </div>

      {demoMode && (
        <div className="demo-banner" role="status">
          <i className="fa-solid fa-circle-info" aria-hidden="true" />
          <span>
            The live Rasa backend isn't reachable right now, so replies
            come from the <strong>in-browser demo engine</strong> — same
            intents and replies, with the same student data. It
            reconnects automatically when the backend is up.
          </span>
        </div>
      )}
    </>
  );
}
