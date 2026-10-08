import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/http';

const sectionNames = {
 hero:'hero',split:'editorial',collections:'collections',features:'features',story:'story',
 productShelf:'collection',testimonials:'testimonials',faq:'faq',marquee:'marquee',newsletter:'newsletter',gallery:'gallery',countdown:'countdown'
};
function useReveal(enabled){
 const ref=useRef(null);
 useEffect(()=>{
  const root=ref.current;if(!root)return;
  if(!enabled||!('IntersectionObserver' in window)||window.matchMedia('(prefers-reduced-motion: reduce)').matches){root.querySelectorAll('[data-reveal]').forEach(el=>el.classList.add('is-visible'));return;}
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:0.08,rootMargin:'0px 0px -5% 0px'});
  root.querySelectorAll('[data-reveal]').forEach(el=>observer.observe(el));
  return()=>observer.disconnect();
 },[enabled]);return ref;
}
function TextButton({href,children,ghost=false}) {return href?<a className={`phase98-cta ${ghost?'phase98-cta-ghost':''}`} href={href}>{children}<span aria-hidden="true">↗</span></a>:null;}
function Picture({section,index}){
 if(!section.image)return <div className="phase98-art-fallback" aria-hidden="true"><span className="phase98-art-orbit"/><i>R</i><span className="phase98-art-line">BOTANICAL · BEAUTY · EVERYDAY</span></div>;
 return <picture>{section.mobileImage&&<source media="(max-width: 700px)" srcSet={section.mobileImage}/>}<img src={section.image} alt={section.imageAlt||section.heading||'Riseora editorial image'} loading={index===0?'eager':'lazy'} decoding="async"/></picture>;
}
function Section({section,index}){
 const content=<><span className="phase98-section-index">{String(index+1).padStart(2,'0')} / RISEORA</span>{section.eyebrow&&<p className="phase98-eyebrow">{section.eyebrow}</p>}{section.heading&&<h2>{section.heading}</h2>}{section.subheading&&<p className="phase98-deck">{section.subheading}</p>}{(section.ctaHref||section.secondaryCtaHref)&&<div className="phase98-ctas"><TextButton href={section.ctaHref}>{section.ctaText||'Explore'}</TextButton><TextButton ghost href={section.secondaryCtaHref}>{section.secondaryCtaText||'Learn more'}</TextButton></div>}</>;
 const hasImage=['hero','split','story'].includes(section.type);
 if(section.type==='marquee')return <section data-reveal data-motion={section.animation} className={`phase98-section phase98-marquee phase98-tone-${section.style}`} aria-label={section.heading||'Brand highlights'}><div className="phase98-marquee-track">{[0,1].map(n=><span key={n} aria-hidden={n===1}>{[section.heading,...section.items.map(item=>item.title)].filter(Boolean).join(' ✦ ')} ✦ </span>)}</div></section>;
 if(section.type==='faq')return <section data-reveal data-motion={section.animation} className={`phase98-section phase98-faq phase98-tone-${section.style}`}><div className="phase98-section-top">{content}</div><div className="phase98-faq-list">{section.items.map(item=><details key={item.id}><summary>{item.title}<span aria-hidden="true">+</span></summary><p>{item.body}</p></details>)}</div></section>;
 if(section.type==='countdown')return <CountdownSection section={section} content={content}/>;
 if(section.type==='newsletter')return <section data-reveal data-motion={section.animation} className={`phase98-section phase98-newsletter phase98-tone-${section.style}`}><div>{content}<p className="phase98-small">Create an account to explore your own care ritual. No automatic marketing subscription.</p></div></section>;
 if(hasImage)return <section data-reveal data-motion={section.animation} className={`phase98-section phase98-editorial phase98-editorial-${section.type} phase98-height-${section.height} phase98-tone-${section.style} phase98-align-${section.align}`}><div className="phase98-editorial-copy">{content}</div><div className="phase98-editorial-media"><Picture section={section} index={index}/></div></section>;
 return <section data-reveal data-motion={section.animation} className={`phase98-section phase98-card-section phase98-tone-${section.style}`}><div className="phase98-card-heading">{content}</div><div className={`phase98-card-grid phase98-card-grid-${section.type}`}>
 {section.items.map((item,i)=><article key={item.id} className="phase98-tile" style={{'--tile-i':i}}>{item.image&&<div className="phase98-tile-media"><img src={item.image} alt={item.title||'Collection'} loading="lazy" decoding="async"/></div>}{item.badge&&<span className="phase98-tile-badge">{item.badge}</span>}<small>{item.label||String(i+1).padStart(2,'0')}</small><h3>{item.title}</h3>{item.body&&<p>{item.body}</p>}{item.href&&<a href={item.href} aria-label={`Explore ${item.title}`}>Explore <span aria-hidden="true">↗</span></a>}</article>)}
 {!section.items.length&&<div className="phase98-tile phase98-empty-tile"><span aria-hidden="true">✳</span><h3>Thoughtfully made. Beautifully yours.</h3><p>Discover rituals crafted to fit your days.</p><a href="/shop">Browse the collection ↗</a></div>}
 </div></section>;
}
function CountdownSection({section,content}){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{if(!section.endAt)return;const t=setInterval(()=>{if(!document.hidden)setNow(Date.now());},60000);return()=>clearInterval(t)},[section.endAt]);
 const remaining=Math.max(0,new Date(section.endAt).getTime()-now);const values=[Math.floor(remaining/864e5),Math.floor(remaining/36e5)%24,Math.floor(remaining/6e4)%60];
 return <section data-reveal data-motion={section.animation} className={`phase98-section phase98-countdown phase98-tone-${section.style}`}><div>{content}</div><div className="phase98-countdown-digits" aria-label={remaining?'Time remaining':'Collection ended'}>{remaining?values.map((v,i)=><span key={i}><strong>{String(v).padStart(2,'0')}</strong><small>{['DAYS','HOURS','MINUTES'][i]}</small></span>):<strong>Collection ended</strong>}</div></section>;
}
export default function PremiumHomeSections({previewDocument=null,preview=false}){
 const [published,setPublished]=useState(null);
 useEffect(()=>{if(preview)return;let live=true;apiFetch('/admin/experience/published').then(result=>{if(live)setPublished(result?.data?.document||null)}).catch(()=>{if(live)setPublished(null)});return()=>{live=false}},[preview]);
 const doc=preview?previewDocument:published;const shown=doc?.sections?.filter(s=>s.enabled)||[];
 const ref=useReveal(Boolean(doc));
 useEffect(()=>{if(preview||!doc||typeof document==='undefined')return;
 const old=document.title;const meta=document.querySelector('meta[name="description"]');const oldDescription=meta?.getAttribute('content');
 if(doc.seo?.title)document.title=doc.seo.title;
 if(meta&&doc.seo?.description)meta.setAttribute('content',doc.seo.description);
 return()=>{document.title=old;if(meta){if(oldDescription==null)meta.removeAttribute('content');else meta.setAttribute('content',oldDescription);}};
 },[doc,preview]);
 if(!doc||!shown.length)return null; // No publication: retain original functioning storefront.
 const brand=doc.brand||{};
 return <div ref={ref} className={`phase98-experience-root ${preview?'phase98-preview-root':'phase98-published'} phase98-accent-${brand.accent||'sage'} phase98-type-${brand.typography||'editorial'} phase98-radius-${brand.radius||'soft'} phase98-motion-${brand.motion||'subtle'} phase98-density-${brand.density||'airy'}`}>
 {doc.announcement?.enabled&&doc.announcement.text&&<div className="phase98-announcement"><span className="phase98-announcement-sparkle" aria-hidden="true">✦</span>{doc.announcement.href?<a href={doc.announcement.href}>{doc.announcement.text} <span aria-hidden="true">↗</span></a>:<span>{doc.announcement.text}</span>}</div>}
 <div className="phase98-section-flow">{shown.map((section,index)=><Section key={section.id} section={section} index={index}/>)}</div>
 <footer className="phase98-curtain"><span>ROOTED IN RITUAL</span><span className="phase98-curtain-mark">RISEORA <em>HERBALS</em></span><a href="/shop">Find your ritual ↗</a></footer>
 </div>;
}
