import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import {
  Add01Icon,
  Folder01Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";
import { Toaster } from "sileo";
import { HookSidebar } from "@/components/ui/hook-sidebar";
import { Button } from "@/components/ui/button";
import "../styles.css";
import {
  LegacyHashRedirect,
  StudioProvider,
} from "../components/studio-context";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#f5f5f3" },
      { name: "description", content: "Local audio and video transcription." },
      { title: "Whisper Studio" },
    ],
    links: [{ rel: "icon", type: "image/svg+xml", href: "/static/mark.svg" }],
  }),
  component: Root,
});

function Root() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  if (pathname === "/welcome")
    return (
      <Document>
        <a className="skip" href="#workspace">
          Skip to setup
        </a>
        <StudioProvider>
          <main id="workspace">
            <Outlet />
          </main>
        </StudioProvider>
      </Document>
    );

  return (
    <Document>
      <a className="skip" href="#workspace">
        Skip to workspace
      </a>
      <div
        className="studio-shell"
        data-sidebar-state={sidebarOpen ? "open" : "closed"}
      >
        <aside
          id="studio-sidebar"
          className="rail"
          aria-hidden={!sidebarOpen}
          inert={!sidebarOpen}
        >
          <div className="rail-header">
            <Link className="brand" to="/" aria-label="Whisper Studio home">
              <img src="/static/mark.svg" alt="" width="38" height="38" />
              <span>whisper</span>
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="sidebar-toggle"
              aria-label="Hide sidebar"
              aria-controls="studio-sidebar"
              aria-expanded="true"
              title="Hide sidebar"
              onClick={() => setSidebarOpen(false)}
            >
              <HugeiconsIcon icon={PanelLeftCloseIcon} strokeWidth={1.7} />
            </Button>
          </div>
          <HookSidebar
            className="rare-nav"
            aria-label="Main navigation"
            items={[
              {
                label: "New transcription",
                href: "/",
                icon: <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />,
              },
              {
                label: "Library",
                href: "/library",
                icon: <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.8} />,
              },
              {
                label: "Settings",
                href: "/settings",
                icon: <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.8} />,
              },
            ]}
          />
        </aside>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="sidebar-reveal"
          aria-label="Show sidebar"
          aria-controls="studio-sidebar"
          aria-expanded="false"
          aria-hidden={sidebarOpen}
          tabIndex={sidebarOpen ? -1 : undefined}
          title="Show sidebar"
          onClick={() => setSidebarOpen(true)}
        >
          <HugeiconsIcon icon={PanelLeftOpenIcon} strokeWidth={1.7} />
        </Button>
        <div className="main-shell">
          <StudioProvider>
            <LegacyHashRedirect />
            <main id="workspace" tabIndex={-1}>
              <Outlet />
            </main>
          </StudioProvider>
        </div>
      </div>
    </Document>
  );
}

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script src="/static/theme.js" />
      </head>
      <body>
        <Toaster
          position="top-right"
          offset={{ top: 18, right: 18 }}
          options={{ duration: 6000, roundness: 16 }}
        />
        {children}
        <Scripts />
      </body>
    </html>
  );
}
