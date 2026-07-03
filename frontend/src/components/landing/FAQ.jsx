const questions = [
  ["Do I need to translate anything manually?", "No. Choose your preferred language and the meeting handles translated captions, chat, and available translated voice automatically."],
  ["Which languages can I choose?", "The current experience includes English, Hindi, German, Spanish, French, Arabic, Dutch, Italian, Portuguese, and Russian."],
  ["Can I message one participant privately?", "Yes. Hosts can message everyone or a specific participant, and participants can send direct messages to the host."],
  ["Can I invite someone with a link?", "Yes. Create a room, copy its meeting link, and share it with authenticated participants."],
  ["Does it work on mobile?", "Yes. The interface adapts to mobile browsers. Camera and microphone access require a secure HTTPS connection."],
];

export default function FAQ() {
  return (
    <div className="faq-list">
      {questions.map(([question, answer]) => (
        <details key={question}>
          <summary>{question}<span aria-hidden="true">+</span></summary>
          <p>{answer}</p>
        </details>
      ))}
    </div>
  );
}
