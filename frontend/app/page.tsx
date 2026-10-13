"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckGlyph, ClockGlyph, CubeGlyph } from "@/components/HeroIcons";

/**
 * Public landing page (route `/`). Server-rendered shell with one small
 * client interaction (mobile nav toggle). All destinations are real:
 * signup/onboarding/hub flows, in-page sections, and the project GitHub.
 * No fake stats, testimonials, integrations, or community URLs.
 */
const CENTER_LINKS = [
  { href: "/", label: "Home" },
  { href: "#how", label: "How It Works" },
  { href: "#community", label: "Join Test Community" },
];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="lp" id="top">
      <header className="lp-nav">
        <Link href="/" className="lp-brand" aria-label="NextStride home">
          <img
            src="/brand/Primary_Logo_light.png"
            alt="NextStride"
            className="lp-brand-logo"
            width={200}
            height={50}
          />
        </Link>
        <nav className="lp-links" aria-label="Primary">
          {CENTER_LINKS.map((l) => (
            <Link key={l.label} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="lp-nav-cta">
          <Link href="#contact">Contact Us</Link>
          <Link href="/login" className="btn btn-secondary">
            Sign In
          </Link>
          <button
            className="icon-btn lp-menu-btn"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span aria-hidden>{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
      </header>
      {menuOpen && (
        <nav className="lp-mobile-menu" aria-label="Mobile">
          {[...CENTER_LINKS, { href: "#contact", label: "Contact Us" }, { href: "/login", label: "Sign In" }].map(
            (l) => (
              <Link key={l.label} href={l.href} onClick={closeMenu}>
                {l.label}
              </Link>
            ),
          )}
        </nav>
      )}

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">Make your next move count</p>
            <h1>
              Too much to do.
              <br />
              Not sure what comes next?
            </h1>
            <p className="lp-accent">Find your next best step.</p>
            <p className="lp-description">
              Think through competing priorities, understand your constraints, and
              decide what deserves your attention next.
            </p>
            <div className="lp-cta-row">
              <Link href="/signup" className="btn btn-primary btn-lg">
                Get Started
              </Link>
              <Link href="#how" className="btn btn-secondary btn-lg">
                See How It Works
              </Link>
            </div>
          </div>
          <div className="lp-hero-panel" aria-label="Preview of the Priority Hub">
            <div className="lp-float lp-float-clock" aria-hidden="true">
              <span className="lp-float-icon lp-float-teal">
                <ClockGlyph />
              </span>
              <span>Deadlines in view</span>
            </div>
            <div className="lp-float lp-float-check" aria-hidden="true">
              <span className="lp-float-icon lp-float-navy">
                <CheckGlyph />
              </span>
              <span>Next step decided</span>
            </div>
            <div className="lp-float lp-float-cube" aria-hidden="true">
              <span className="lp-float-icon lp-float-lime">
                <CubeGlyph />
              </span>
              <span>3 priorities</span>
            </div>
            <div className="lp-mock">
              <p className="lp-mock-label">Your situation</p>
              <p className="lp-mock-text">
                Lecture 2–5:30pm · fellowship from 4:30pm · assignment due tomorrow
              </p>
              <div className="lp-mock-chips">
                <span className="pill">Lecture</span>
                <span className="pill">Fellowship</span>
                <span className="pill">Assignment</span>
              </div>
              <p className="lp-mock-arrow" aria-hidden="true">↓</p>
              <div className="lp-mock-rec">
                <p className="lp-mock-label">Next best step</p>
                <p className="lp-mock-next">Attend the lecture, then reassess the fellowship.</p>
                <p className="lp-mock-why">Why: the lecture is fixed and first; the assignment still has evening hours.</p>
              </div>
            </div>
            <div className="lp-flow" aria-hidden="true">
              <span>Situation</span>
              <span>→</span>
              <span>Priorities</span>
              <span>→</span>
              <span>Next Step</span>
            </div>
          </div>
        </section>

        <section className="lp-section" id="how">
          <h2>How NextStride works</h2>
          <p className="muted">Three steps, grounded in your real constraints — not a generic task list.</p>
          <div className="lp-steps">
            <div className="card lp-step">
              <p className="lp-step-num">1</p>
              <h3>Bring the situation into focus</h3>
              <p>Describe the responsibilities and pressures competing for your attention, in your own words.</p>
            </div>
            <div className="card lp-step">
              <p className="lp-step-num">2</p>
              <h3>Understand what matters</h3>
              <p>NextStride reasons about urgency, deadlines, constraints, and human needs — and shows its working.</p>
            </div>
            <div className="card lp-step">
              <p className="lp-step-num">3</p>
              <h3>Decide your next step</h3>
              <p>Get a concrete recommendation with its reasoning, then update us when things change for a reassessment.</p>
            </div>
          </div>
        </section>

        <section className="lp-section lp-band" id="community">
          <h2>Join the test community</h2>
          <p className="muted">
            NextStride is live in early testing. Create an account to try the Priority Hub
            with your own situations — your experience shapes what we build next.
          </p>
          <Link href="/signup" className="btn btn-primary btn-lg">
            Request Early Access
          </Link>
        </section>

        <section className="lp-section" id="contact">
          <h2>Contact us</h2>
          <p className="muted">
            Questions, feedback, or demo requests — the fastest route is our public
            project page, where you can open an issue or start a discussion.
          </p>
          <a
            className="btn btn-secondary btn-lg"
            href="https://github.com/kingsoduah/nextstride"
            target="_blank"
            rel="noreferrer"
          >
            NextStride on GitHub
          </a>
        </section>
      </main>

      <footer className="lp-footer">
        <span>© 2026 NextStride</span>
        <span className="lp-footer-links">
          <a href="https://github.com/kingsoduah/nextstride" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <Link href="/login">Sign In</Link>
        </span>
      </footer>
    </div>
  );
}
