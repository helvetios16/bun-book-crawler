import type { CliRenderer } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { JSX } from "react";
import { useState } from "react";
import { IconBackground } from "../components/atoms/IconBackground";
import { PlaceholderView } from "../components/molecules/PlaceholderView";
import { MainMenu, type MenuOption } from "../components/organisms/MainMenu";

// --- Interfaces ---

interface DashboardProps {
  readonly renderer: CliRenderer;
}

interface KeyboardKey {
  readonly name: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

type ViewState = "menu" | "search_book" | "search_editions" | "search_blog";

// --- Main App ---

export function Dashboard({ renderer }: DashboardProps): JSX.Element {
  const [currentView, setCurrentView] = useState<ViewState>("menu");

  const menuItems: MenuOption[] = [
    { label: "Search Book", value: "search_book" },
    { label: "Search Editions", value: "search_editions" },
    { label: "Search Blog Books", value: "search_blog" },
  ];

  useKeyboard((key: KeyboardKey) => {
    // Global Exit
    if (key.ctrl && key.name === "c") {
      if (renderer) {
        renderer.destroy();
      }
      process.exit(0);
    }

    // Return to menu from sub-views
    if (currentView !== "menu" && key.name === "escape") {
      setCurrentView("menu");
    }
  });

  const handleMenuSelect = (value: string) => {
    setCurrentView(value as ViewState);
  };

  const handleQuit = () => {
    if (renderer) {
      renderer.destroy();
    }
    process.exit(0);
  };

  return (
    <IconBackground intensity={20} speed={200}>
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        justifyContent="center"
        alignItems="center"
      >
        {currentView === "menu" ? (
          <MainMenu options={menuItems} onSelect={handleMenuSelect} onQuit={handleQuit} />
        ) : (
          <>
            {currentView === "search_book" && (
              <PlaceholderView
                title="SEARCH BOOK"
                description="Enter the title of the book you want to find."
              />
            )}

            {currentView === "search_editions" && (
              <PlaceholderView
                title="SEARCH EDITIONS"
                description="Enter the Book ID to find all its editions."
              />
            )}

            {currentView === "search_blog" && (
              <PlaceholderView
                title="SEARCH BLOG BOOKS"
                description="Enter the Blog URL to scrape for books."
              />
            )}
          </>
        )}
      </box>
    </IconBackground>
  );
}
