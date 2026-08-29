import { TOKEN_DISPLAY_NAME } from "@explorer/config";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>{TOKEN_DISPLAY_NAME} Explorer</span>
        <nav className="flex gap-4">
          <a href="/legal/privacy" className="hover:text-text">
            Privacy
          </a>
          <a href="/legal/terms" className="hover:text-text">
            Terms
          </a>
        </nav>
      </div>
    </footer>
  );
}
