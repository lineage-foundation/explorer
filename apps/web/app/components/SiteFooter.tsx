import Link from "next/link";
import { TOKEN_DISPLAY_NAME } from "@explorer/config";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>{TOKEN_DISPLAY_NAME} Explorer</span>
        <nav className="flex gap-4">
          {/* Served by the Hono app under the /api/v1 catch-all, not a Next
              route — use a plain anchor so Next doesn't try to client-navigate
              or prefetch it. Relative path so it resolves on any deployment. */}
          <a href="/api/v1/docs" className="hover:text-text">
            API
          </a>
          <Link href="/legal/privacy" className="hover:text-text">
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-text">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
