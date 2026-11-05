"use client";

import { useEffect, useRef, useState } from "react";
import {
  Blocks,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileText,
  Files,
  Globe,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Monitor,
  Package,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Undo2,
  Wrench,
  Rocket,
  Layers3,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Website } from "@/lib/kora/client";
import { WebsiteBrand } from "./website-brand";

export type WebsiteSection =
  | "websites"
  | "overview"
  | "pages"
  | "editor"
  | "code"
  | "publish"
  | "settings"
  | "board";
type Props = {
  organization: string;
  sites: Website[];
  site: Website | null;
  active: WebsiteSection;
  busy: boolean;
  onNavigate: (section: WebsiteSection) => void;
  onSelectSite: (site: Website) => void;
};

export function WebsiteSidebar(props: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hint, setHint] = useState("");
  const desktopSelect = useRef<HTMLSelectElement>(null);
  const mobileSelect = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (hint && !collapsed) (mobileOpen ? mobileSelect : desktopSelect).current?.focus();
  }, [hint, collapsed, mobileOpen]);
  function navigate(section: WebsiteSection) {
    if (props.busy) {
      setHint("");
      return;
    }
    if (section !== "websites" && !props.site) {
      setHint(props.sites.length ? "Choose a website above to open its tools." : "Create your first website to use these tools.");
      setCollapsed(false);
      return;
    }
    setHint("");
    props.onNavigate(section);
    setMobileOpen(false);
  }
  const items = [
    {
      label: "All websites",
      icon: Globe,
      section: "websites" as const,
      enabled: true,
    },
    {
      label: "Overview",
      icon: LayoutDashboard,
      section: "overview" as const,
      enabled: !!props.site,
    },
    {
      label: "Pages",
      icon: Files,
      section: "pages" as const,
      enabled: !!props.site,
    },
    {
      label: "Website editor",
      icon: Monitor,
      section: "editor" as const,
      enabled: !!props.site,
    },
    {
      label: "Source code",
      icon: Code2,
      section: "code" as const,
      enabled: !!props.site,
    },
    {
      label: "Review board",
      icon: Layers3,
      section: "board" as const,
      enabled: !!props.site,
    },
    {
      label: "Publish website",
      icon: Rocket,
      section: "publish" as const,
      enabled: !!props.site,
    },
  ];
  const upcoming = [
    { label: "Services", icon: Wrench },
    { label: "Products", icon: Package },
    { label: "Bookings", icon: CalendarDays },
    { label: "Chatbot", icon: MessageSquare },
    { label: "Orders", icon: ShoppingBag },
    { label: "Content", icon: Blocks },
    { label: "Blogs", icon: FileText },
    { label: "SEO", icon: Search },
    { label: "Redirects", icon: Undo2 },
    { label: "Analytics", icon: TrendingUp },
    { label: "Domains", icon: Globe },
  ];
  function content(compact: boolean, mobile = false) {
    return (
      <>
        <div className="kw-sidebar-brand">
          <WebsiteBrand compact={compact} />
        </div>
        {!compact && (
          <div className="kw-sidebar-context">
            <span className="kw-eyebrow">WEBSITE WORKSPACE</span>
            <strong>{props.organization}</strong>
            <label>
              Website
              <select
                ref={mobile ? mobileSelect : desktopSelect}
                aria-label="Switch website"
                value={props.site?._id || ""}
                disabled={props.busy || !props.sites.length}
                onChange={(event) => {
                  const next = props.sites.find(
                    (site) => site._id === event.target.value,
                  );
                  setHint("");
                  if (next) props.onSelectSite(next);
                  setMobileOpen(false);
                }}
              >
                <option value="" disabled>
                  Select a website
                </option>
                {props.sites.map((site) => (
                  <option key={site._id} value={site._id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {compact && <button className="kw-nav-item kw-compact-switch" aria-label="Switch website" title={props.site?.name || "Choose a website"} onClick={() => setCollapsed(false)}><Globe size={16} /></button>}
        {(props.busy || (!props.site && hint)) && !compact && <p className="kw-sidebar-hint" role="status">{props.busy ? "Working? Your section will stay selected." : hint}</p>}
        <nav className="kw-sidebar-nav" aria-label="Website navigation" aria-busy={props.busy}>
          {items.map((item) => (
            <button
              key={item.section}
              className={`kw-nav-item ${props.active === item.section ? "is-active" : ""}`}
              aria-label={item.label}
              aria-current={props.active === item.section ? "page" : undefined}
              title={!item.enabled ? "Select a website first" : item.label}

              data-needs-website={!item.enabled || undefined}
              onClick={() => navigate(item.section)}
            >
              <item.icon size={16} />
              {!compact && <span>{item.label}</span>}
            </button>
          ))}
          <div className="kw-sidebar-divider" />
          {!compact && <details className="kw-planned-tools">
            <summary>More website tools <span>Planned</span></summary>
            <p>These features will be added phase by phase.</p>
            {upcoming.map(item => <div key={item.label} className="kw-planned-item"><item.icon size={15} /><span>{item.label}</span></div>)}
          </details>}
        </nav>
        <div className="kw-sidebar-footer">
          <button
            className={`kw-nav-item ${props.active === "settings" ? "is-active" : ""}`}
            aria-current={props.active === "settings" ? "page" : undefined}

            onClick={() => navigate("settings")}
            title="Website settings"
            aria-label="Website settings"
          >
            <Settings2 size={16} />
            {!compact && <span>Website settings</span>}
          </button>
          {!compact && (
            <div className="kw-sidebar-kora">
              <Sparkles size={16} />
              <span>
                Built with NOVYA<small>Your business, online.</small>
              </span>
            </div>
          )}
        </div>
      </>
    );
  }
  return (
    <>
      <aside
        className={`kw-sidebar ${collapsed ? "is-collapsed" : ""}`}
        aria-label="Website sidebar"
      >
        <button
          className="kw-sidebar-toggle"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
        {content(collapsed)}
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          className="kw-mobile-nav-trigger"
          aria-label="Open website navigation"
        >
          <Menu size={18} />
        </SheetTrigger>
        <SheetContent side="left" className="kw-sidebar-sheet">
          <SheetHeader>
            <SheetTitle>Website navigation</SheetTitle>
          </SheetHeader>
          <div className="kw-app kw-mobile-sidebar-body">{content(false, true)}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
