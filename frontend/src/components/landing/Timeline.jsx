const steps = [
  ["01", "Create or join", "Open a meeting link and enter the room from your browser."],
  ["02", "Choose your language", "Tell the meeting which language you prefer to hear and read."],
  ["03", "Speak naturally", "Talk normally without pausing to translate yourself."],
  ["04", "Follow every word", "See live captions and translated messages while people speak."],
  ["05", "Collaborate freely", "Hear, read, and reply in the language that feels natural to you."],
];

export default function Timeline() {
  return (
    <ol className="pipeline-timeline">
      {steps.map(([number, title, text]) => (
        <li key={number}>
          <span className="pipeline-timeline__number">{number}</span>
          <div><h3>{title}</h3><p>{text}</p></div>
        </li>
      ))}
    </ol>
  );
}
