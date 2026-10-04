"use client";

export const EXAMPLE_SITUATIONS = [
  {
    title: "Lecture vs fellowship vs delivery",
    description: "Fixed lecture overlaps coordinating a program, plus a deadline",
    text: "I have a lecture from 2–5:30pm, fellowship program starts at 4:30pm and I am coordinating it with my assistant. A customer is waiting for a delivery tonight, and I have an assignment due tomorrow morning.",
  },
  {
    title: "Shift vs exam prep",
    description: "Work shift collides with study for a morning exam",
    text: "I picked up a work shift from 4–9pm but I have an exam tomorrow morning I have not finished studying for. My roommate offered to cover the first two hours of the shift.",
  },
  {
    title: "Two deadlines, one evening",
    description: "Customer order and group project due the same night",
    text: "A customer order must go out tonight and my group project section is due at midnight. The group said they can submit without my part but it will affect my grade. I have about 4 hours free.",
  },
];

export function ExampleCards({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div>
      <div className="examples-head">
        <span>Get started with some examples</span>
      </div>
      <div className="examples">
        {EXAMPLE_SITUATIONS.map((ex) => (
          <button key={ex.title} className="example-card" onClick={() => onSelect(ex.text)}>
            <div aria-hidden>◇</div>
            <h3>{ex.title}</h3>
            <p>{ex.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
