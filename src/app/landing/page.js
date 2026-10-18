"use client";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        background: "var(--color-canvas)",
        color: "var(--color-ink)",
        minHeight: "100vh",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          height: "56px",
          borderBottom: "1px solid var(--color-hairline)",
          background: "var(--color-canvas)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 40px",
        }}
      >
        <span style={{ fontSize: "16px", fontWeight: 700 }}>9Router</span>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <a
            href="https://github.com/decolua/9router"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "14px", color: "var(--color-mute)", textDecoration: "none" }}
          >
            GitHub
          </a>
          <a
            href="/dashboard"
            style={{
              fontSize: "16px",
              fontWeight: 500,
              color: "var(--color-on-dark)",
              background: "var(--color-ink)",
              padding: "4px 20px",
              borderRadius: "4px",
              textDecoration: "none",
              lineHeight: "2",
              display: "inline-block",
            }}
          >
            Dashboard
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: "960px", margin: "0 auto", padding: "96px 40px 0" }}>
        <p style={{ fontSize: "14px", color: "var(--color-mute)", lineHeight: "2", marginBottom: "16px" }}>
          [i] Open source · Self-hosted · OpenAI-compatible
        </p>
        <h1
          style={{
            fontSize: "38px",
            fontWeight: 700,
            lineHeight: 1.5,
            maxWidth: "720px",
            marginBottom: "24px",
          }}
        >
          One endpoint for all your AI providers.
        </h1>
        <p style={{ fontSize: "16px", color: "var(--color-body)", maxWidth: "520px", lineHeight: 1.5, marginBottom: "32px" }}>
          Route, fallback, and manage 40+ AI providers through a single OpenAI-compatible API. No code changes required.
        </p>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={() => router.push("/dashboard")}
            style={{
              background: "var(--color-ink)",
              color: "var(--color-on-dark)",
              border: "none",
              padding: "4px 20px",
              height: "36px",
              borderRadius: "4px",
              fontSize: "16px",
              fontWeight: 500,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              lineHeight: "2",
            }}
          >
            Open Dashboard
          </button>
          <a
            href="https://github.com/decolua/9router"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "var(--color-canvas)",
              color: "var(--color-ink)",
              border: "1px solid var(--color-hairline-strong)",
              padding: "4px 20px",
              height: "36px",
              borderRadius: "4px",
              fontSize: "16px",
              fontWeight: 500,
              fontFamily: "var(--font-mono)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              lineHeight: "2",
            }}
          >
            GitHub →
          </a>
        </div>
      </section>

      {/* TUI Hero Mockup */}
      <section style={{ maxWidth: "960px", margin: "0 auto", padding: "48px 40px 0" }}>
        <div
          style={{
            background: "var(--color-surface-dark)",
            padding: "48px 32px",
            borderRadius: "0",
          }}
        >
          <pre
            style={{
              color: "var(--color-on-dark)",
              fontFamily: "var(--font-mono)",
              fontSize: "16px",
              lineHeight: 1.5,
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
{`  9ROUTER

  ┌─────────────────────────────────────────────────────────┐
  │  $ curl http://localhost:20128/v1/chat/completions \\     │
  │      -H "Content-Type: application/json" \\              │
  │      -d '{"model":"gpt-4o","messages":[...]}' \\         │
  │      -H "Authorization: Bearer your-api-key"            │
  └─────────────────────────────────────────────────────────┘

  [+] Route to Claude, GPT, Gemini, Mistral — same endpoint
  [+] Auto-fallback when quota exceeded
  [+] OAuth token refresh handled automatically
  [+] Usage tracking & quota management`}
          </pre>
          <div
            style={{
              marginTop: "32px",
              borderTop: "1px solid rgba(255,251,248,0.12)",
              paddingTop: "12px",
              color: "var(--color-on-dark-mute)",
              fontSize: "14px",
              lineHeight: 2,
            }}
          >
            tab switch provider&nbsp;&nbsp;&nbsp;&nbsp;ctrl-p commands&nbsp;&nbsp;&nbsp;&nbsp;? help
          </div>
        </div>
      </section>

      {/* Install */}
      <section style={{ maxWidth: "960px", margin: "0 auto", padding: "96px 40px 0" }}>
        <hr style={{ border: "none", borderTop: "1px solid var(--color-hairline)", marginBottom: "48px" }} />
        <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "24px" }}>Install</h2>
        <div
          style={{
            background: "var(--color-surface-card)",
            padding: "12px 16px",
            borderRadius: "4px",
            border: "1px solid var(--color-hairline)",
            marginBottom: "12px",
          }}
        >
          <code style={{ fontSize: "16px", fontFamily: "var(--font-mono)" }}>
            npx 9router
          </code>
        </div>
        <div
          style={{
            background: "var(--color-surface-card)",
            padding: "12px 16px",
            borderRadius: "4px",
            border: "1px solid var(--color-hairline)",
          }}
        >
          <code style={{ fontSize: "16px", fontFamily: "var(--font-mono)", color: "var(--color-mute)" }}>
            # or: npm install -g 9router && 9router
          </code>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: "960px", margin: "0 auto", padding: "96px 40px 0" }}>
        <hr style={{ border: "none", borderTop: "1px solid var(--color-hairline)", marginBottom: "48px" }} />
        <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "24px" }}>What it does</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {[
            { marker: "[+]", label: "40+ providers", desc: "Anthropic, OpenAI, Google, Mistral, Cohere, and more — one endpoint" },
            { marker: "[+]", label: "Model combos", desc: "Chain models with automatic fallback when quota is exceeded" },
            { marker: "[+]", label: "OAuth management", desc: "Token refresh, multi-account, cursor, kiro, and MITM proxy support" },
            { marker: "[+]", label: "Usage tracking", desc: "Per-provider token usage, cost estimates, and request logs" },
            { marker: "[+]", label: "Token saver", desc: "Compress tool_result content to reduce token consumption automatically" },
            { marker: "[+]", label: "Local-first", desc: "SQLite storage, no cloud dependency, self-hosted on your machine" },
          ].map(({ marker, label, desc }) => (
            <div
              key={label}
              style={{
                padding: "8px 0",
                borderBottom: "1px solid var(--color-hairline)",
                fontSize: "16px",
                lineHeight: 1.5,
                color: "var(--color-body)",
                display: "flex",
                gap: "12px",
              }}
            >
              <span style={{ color: "var(--color-ink)", fontWeight: 500, flexShrink: 0 }}>{marker}</span>
              <span>
                <strong style={{ color: "var(--color-ink)", fontWeight: 700 }}>{label}</strong>
                {"    "}
                {desc}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section style={{ maxWidth: "960px", margin: "0 auto", padding: "96px 40px 0" }}>
        <hr style={{ border: "none", borderTop: "1px solid var(--color-hairline)", marginBottom: "48px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0" }}>
          {[
            { fig: "Fig 1.", stat: "40+", label: "AI providers" },
            { fig: "Fig 2.", stat: "v2", label: "Local SQLite storage" },
            { fig: "Fig 3.", stat: "MIT", label: "Open source license" },
          ].map(({ fig, stat, label }) => (
            <div
              key={fig}
              style={{
                padding: "16px",
                borderRight: "1px solid var(--color-hairline)",
              }}
            >
              <div style={{ fontSize: "32px", fontWeight: 700, lineHeight: 1.2 }}>{stat}</div>
              <div style={{ fontSize: "14px", color: "var(--color-mute)", lineHeight: 2 }}>{fig} {label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: "960px", margin: "0 auto", padding: "96px 40px 0" }}>
        <hr style={{ border: "none", borderTop: "1px solid var(--color-hairline)", marginBottom: "48px" }} />
        <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "24px" }}>FAQ</h2>
        <div>
          {[
            { q: "What ports does it use?", a: "Dashboard runs on :20128 by default. API gateway on :20127. Both configurable via PORT env." },
            { q: "Does it work with any OpenAI client?", a: "Yes. Set the base URL to http://localhost:20128/v1 and any SDK works unchanged." },
            { q: "Where is data stored?", a: "SQLite database at ~/.9router/. No cloud, no telemetry beyond optional GA on the dashboard." },
            { q: "How does fallback work?", a: "Create a combo with ordered providers. When one fails or exceeds quota, the next runs automatically." },
          ].map(({ q, a }) => (
            <div
              key={q}
              style={{
                padding: "12px 0",
                borderBottom: "1px solid var(--color-hairline)",
                fontSize: "16px",
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "4px" }}>[+] {q}</div>
              <div style={{ color: "var(--color-body)" }}>{a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: "960px", margin: "0 auto", padding: "96px 40px" }}>
        <hr style={{ border: "none", borderTop: "1px solid var(--color-hairline)", marginBottom: "48px" }} />
        <h2 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px" }}>Get started</h2>
        <p style={{ fontSize: "16px", color: "var(--color-body)", marginBottom: "24px" }}>
          9Router is open source and free. No account, no API key required.
        </p>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => router.push("/dashboard")}
            style={{
              background: "var(--color-ink)",
              color: "var(--color-on-dark)",
              border: "none",
              padding: "4px 20px",
              height: "36px",
              borderRadius: "4px",
              fontSize: "16px",
              fontWeight: 500,
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
            }}
          >
            Open Dashboard
          </button>
          <a
            href="https://github.com/decolua/9router#readme"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "var(--color-canvas)",
              color: "var(--color-ink)",
              border: "1px solid var(--color-hairline-strong)",
              padding: "4px 20px",
              height: "36px",
              borderRadius: "4px",
              fontSize: "16px",
              fontWeight: 500,
              fontFamily: "var(--font-mono)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Documentation
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--color-hairline)",
          padding: "32px 40px",
          maxWidth: "960px",
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <span style={{ fontSize: "14px", color: "var(--color-mute)", lineHeight: 2 }}>
            ©2026 9Router · MIT License
          </span>
          <div style={{ display: "flex", gap: "24px" }}>
            {[
              { label: "GitHub", href: "https://github.com/decolua/9router" },
              { label: "Changelog", href: "https://github.com/decolua/9router/blob/main/CHANGELOG.md" },
              { label: "Dashboard", href: "/dashboard" },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                style={{
                  fontSize: "14px",
                  color: "var(--color-mute)",
                  textDecoration: "none",
                  lineHeight: 2,
                }}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
