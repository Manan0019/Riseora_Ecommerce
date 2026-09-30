import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../api/http";
import { Icon } from "./Icons";

export default function HeroCarousel({ banners = [] }) {
  const slides = useMemo(() => banners.filter(Boolean), [banners]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const touchStartX = useRef(null);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  useEffect(() => {
    if (slides.length <= 1 || paused || manualPaused) return undefined;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) return undefined;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % slides.length), 5200);
    return () => window.clearInterval(timer);
  }, [slides.length, paused, manualPaused]);

  if (!slides.length) return null;

  function go(direction) {
    setIndex((value) => (value + direction + slides.length) % slides.length);
  }

  function onTouchStart(event) {
    touchStartX.current = event.changedTouches?.[0]?.clientX ?? null;
  }

  function onTouchEnd(event) {
    const start = touchStartX.current;
    const end = event.changedTouches?.[0]?.clientX;
    touchStartX.current = null;
    if (start == null || end == null || Math.abs(end - start) < 45) return;
    go(end < start ? 1 : -1);
  }

  return (
    <section
      className="campaign-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      aria-roledescription="carousel"
      aria-label="Riseora campaigns"
    >
      <div className="campaign-carousel-stage">
        {slides.map((hero, slideIndex) => (
          <article
            key={hero.id || `${hero.title}-${slideIndex}`}
            className={`campaign-hero campaign-carousel-slide ${slideIndex === index ? "active" : ""}`}
            style={{ "--hero-bg": hero.background || "#d8a693", "--hero-color": hero.textColor || "#11251c" }}
            aria-hidden={slideIndex !== index}
          >
            <div className="container campaign-hero-grid">
              <div className="campaign-copy">
                <p className="hero-kicker">{hero.eyebrow || "RISEORA HERBALS"}</p>
                <h1>{hero.title}</h1>
                {hero.description && <p>{hero.description}</p>}
                <div className="campaign-actions">
                  <Link className="black-button" to={hero.ctaLink || "/shop"}>{hero.ctaText || "SHOP NOW"}</Link>
                  <Link className="underlined-link" to="/offers">VIEW OFFERS</Link>
                </div>
                <div className="micro-trust"><span>✓ Secure checkout</span><span>✓ Delivery across India</span></div>
              </div>
              <div className="campaign-visual">
                {hero.imageUrl ? (
                  <picture>
                    {hero.mobileImageUrl && <source media="(max-width: 639px)" srcSet={mediaUrl(hero.mobileImageUrl)} />}
                    <img src={mediaUrl(hero.imageUrl)} alt={hero.title} loading={slideIndex === 0 ? "eager" : "lazy"} decoding="async" />
                  </picture>
                ) : (
                  <div className="campaign-placeholder"><span>R</span><strong>RISEORA</strong><small>HERBALS</small><i>your campaign image</i></div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <div className="campaign-carousel-controls">
            <button type="button" onClick={() => go(-1)} aria-label="Previous campaign"><span className="carousel-prev-icon"><Icon name="arrow" size={19} /></span></button>
            <div className="campaign-carousel-dots" aria-label="Choose campaign">
              {slides.map((slide, dotIndex) => <button key={slide.id || dotIndex} type="button" className={dotIndex === index ? "active" : ""} onClick={() => setIndex(dotIndex)} aria-label={`Show campaign ${dotIndex + 1}`} />)}
            </div>
            <button type="button" onClick={() => go(1)} aria-label="Next campaign"><Icon name="arrow" size={19} /></button>
            <button type="button" className="campaign-pause-button" onClick={() => setManualPaused((value) => !value)} aria-label={manualPaused ? "Resume campaign slideshow" : "Pause campaign slideshow"}>{manualPaused ? "▶" : "Ⅱ"}</button>
          </div>
          <div className="campaign-carousel-progress" aria-hidden="true"><span key={index} className={paused || manualPaused ? "paused" : ""} /></div>
        </>
      )}
    </section>
  );
}
