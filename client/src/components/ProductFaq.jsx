import { useState } from "react";
import RichText from "./RichText";

export default function ProductFaq({ items = [] }) {
  const [openIndex, setOpenIndex] = useState(null);
  return <div className="phase19-faq-list">{items.map((item, index) => {
    const open = openIndex === index;
    return <article className={open ? "phase19-faq-item open" : "phase19-faq-item"} key={`${item.question}-${index}`}>
      <button type="button" className="phase19-faq-question" aria-expanded={open} onClick={() => setOpenIndex(open ? null : index)}>
        <span>{item.question}</span><i aria-hidden="true">+</i>
      </button>
      <div className="phase19-faq-answer-wrap" aria-hidden={!open}><div><RichText value={item.answer} className="phase19-faq-answer" /></div></div>
    </article>;
  })}</div>;
}
