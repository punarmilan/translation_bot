const defaultQuestions = [
  ["Do I need to translate anything manually?", "No. Choose your preferred language and the meeting handles translated captions, chat, and available translated voice automatically."],
  ["Which languages can I choose?", "The current experience includes English, Hindi, German, Spanish, French, Arabic, Dutch, Italian, Portuguese, and Russian."],
  ["Can I message one participant privately?", "Yes. Hosts can message everyone or a specific participant, and participants can send direct messages to the host."],
  ["Can I invite someone with a link?", "Yes. Create a room, copy its meeting link, and share it with authenticated participants."],
  ["Does it work on mobile?", "Yes. The interface adapts to mobile browsers. Camera and microphone access require a secure HTTPS connection."],
];

export default function FAQ({ cms, customCards }) {
  const items = customCards && customCards.length > 0
    ? customCards.map((c) => ({
        question: c.question || c.title || "Question",
        answer: c.answer || c.description || "Answer details",
      }))
    : (cms?.items || defaultQuestions.map(([q, a]) => ({ question: q, answer: a })));

  return (
    <div className="faq-list">
      {items.map((item, idx) => (
        <details key={item.question || idx}>
          <summary>
            {item.question}
            <span aria-hidden="true">+</span>
          </summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
