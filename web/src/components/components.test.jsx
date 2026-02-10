import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Messages } from "./Messages.jsx";
import { HistoryList, Sidebar } from "./Sidebar.jsx";

const bot = (text, buttons) => ({ from: "bot", text, ts: 0, ...(buttons ? { buttons } : {}) });
const user = (text, payload) => ({ from: "user", text, ts: 0, ...(payload ? { payload } : {}) });
const count = (html, needle) => html.split(needle).length - 1;

const render = (messages, busy = false) =>
  renderToStaticMarkup(
    <Messages
      messages={messages}
      busy={busy}
      showQuickReplies
      onQuickReply={() => {}}
      onChoose={() => {}}
      bottomRef={{ current: null }}
    />
  );

describe("suggested questions", () => {
  it("shows three under the latest reply", () => {
    expect(count(render([bot("Hello")]), 'class="chip"')).toBe(3);
  });

  it("does not repeat a question that was already asked", () => {
    const html = render([user("What days do I have lectures?"), bot("Monday")]);
    expect(html).not.toContain('class="chip">What days do I have lectures?');
    expect(count(html, 'class="chip"')).toBe(3);
    expect(html).toContain("Show my timetable");
  });
});

describe("reply buttons", () => {
  const buttons = [1, 2, 3, 4, 5].map((n) => ({ title: `Borrow book ${n}`, payload: `/b${n}` }));

  it("shows three at most", () => {
    expect(count(render([bot("Pick", buttons)]), 'class="reply-btn"')).toBe(3);
  });

  it("leaves out the ones already clicked", () => {
    const html = render([user("Borrow book 1", "/b1"), bot("Pick", buttons)]);
    expect(html).not.toMatch(/class="reply-btn">(<i[^>]*><\/i>)?Borrow book 1</);
    expect(html).toMatch(/class="reply-btn">(<i[^>]*><\/i>)?Borrow book 2</);
    expect(html).toMatch(/class="reply-btn">(<i[^>]*><\/i>)?Borrow book 4</);
  });

  it("falls back to suggested questions when every button was used", () => {
    const one = [{ title: "Only", payload: "/only" }];
    const html = render([user("Only", "/only"), bot("Pick", one)]);
    expect(count(html, 'class="reply-btn"')).toBe(0);
  });

  it("shows no buttons while the bot is typing", () => {
    expect(count(render([bot("Pick", buttons)], true), 'class="reply-btn"')).toBe(0);
  });
});

describe("chat history", () => {
  const history = [
    { id: "b", title: "Show my borrowed books", ts: 2000 },
    { id: "a", title: "Who is my teacher?", ts: 1000 },
  ];

  it("lists each conversation by what was asked or the button clicked", () => {
    const html = renderToStaticMarkup(<HistoryList history={history} currentId="a" busy={false} />);
    expect(html).toContain("Show my borrowed books");
    expect(html).toContain("Who is my teacher?");
    expect(count(html, 'aria-current="true"')).toBe(1);
  });

  it("says so when there is nothing yet", () => {
    expect(renderToStaticMarkup(<HistoryList history={[]} busy={false} />)).toContain("Nothing asked yet");
  });

  it("has a Chat History option under Conversation", () => {
    const html = renderToStaticMarkup(<Sidebar busy={false} user={{ first: "A", last: "B" }} />);
    expect(html.indexOf("Conversation")).toBeLessThan(html.indexOf("New conversation"));
    expect(html.indexOf("New conversation")).toBeLessThan(html.indexOf("Chat History"));
    expect(html).toContain('aria-expanded="false"');
  });
});
