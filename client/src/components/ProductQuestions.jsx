import { useState } from "react";

export default function ProductQuestions({ items = [] }) {
  const [openId, setOpenId] = useState(items[0]?.id || "");
  return <div className="phase22-qa-list">
    {items.map((item) => {
      const open = openId === item.id;
      return <article className={open ? "phase22-qa-item open" : "phase22-qa-item"} key={item.id}>
        <button type="button" className="phase22-qa-question" aria-expanded={open} onClick={() => setOpenId(open ? "" : item.id)}>
          <span><b>Q</b>{item.question}</span><i aria-hidden="true">+</i>
        </button>
        <div className="phase22-qa-answer-wrap" aria-hidden={!open}>
          <div className="phase22-qa-answer"><span>A</span><div><p>{item.answer}</p><small>Answered by Riseora{item.answeredAt ? ` · ${new Date(item.answeredAt).toLocaleDateString("en-IN")}` : ""}</small></div></div>
        </div>
      </article>;
    })}
  </div>;
}
