import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LegacyHashRedirect,
  StudioProvider,
} from "../components/studio-context";
import "../../studio/static/styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#f7f4ee" },
      { name: "description", content: "Local audio and video transcription." },
      { title: "Whisper Studio" },
    ],
    links: [{ rel: "icon", type: "image/svg+xml", href: "/static/mark.svg" }],
  }),
  component: Root,
});

function Root() {
  return (
    <Document>
      <a className="skip" href="#workspace">
        Skip to workspace
      </a>
      <aside className="rail">
        <Link className="brand" to="/" aria-label="Whisper Studio home">
          <img src="/static/mark.svg" alt="" width="38" height="38" />
          <span>whisper</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/" activeOptions={{ exact: true }}>
            <span aria-hidden="true">＋</span> New transcription
          </Link>
          <Link to="/library">
            <span aria-hidden="true">▤</span> Library
          </Link>
          <Link to="/settings">
            <span aria-hidden="true">⚙</span> Settings
          </Link>
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="local-badge">
            <span className="dot" /> Local engine
          </span>
        </header>
        <StudioProvider>
          <LegacyHashRedirect />
          <main id="workspace" tabIndex={-1}>
            <Outlet />
          </main>
        </StudioProvider>
      </div>
    </Document>
  );
}

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
