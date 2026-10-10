import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { ItemMetadata } from "../ItemMetadata.js";
import { ItemLink } from "../ItemLink.js";

describe("ItemMetadata", () => {
  it("renders one row per key of a JSON object", () => {
    render(<ItemMetadata metadata={'{"title":"Alpha","medium":"digital"}'} />);
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("digital")).toBeInTheDocument();
  });

  it("shows metadata that is not a JSON object as raw text", () => {
    render(<ItemMetadata metadata="a rare dragon egg" />);
    expect(screen.getByText("a rare dragon egg")).toBeInTheDocument();
  });

  it("renders markup in raw metadata as inert text", () => {
    const { container } = render(<ItemMetadata metadata={'<img src=x onerror=alert(1)><script>x()</script>'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("renders markup and script URLs in JSON values as inert text, never as links", () => {
    const { container } = render(
      <ItemMetadata metadata={'{"pic":"<img src=x onerror=alert(1)>","url":"javascript:alert(1)","site":"https://example.com"}'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  });

  it("renders nothing when there is no metadata", () => {
    expect(render(<ItemMetadata metadata={null} />).container.innerHTML).toBe("");
    expect(render(<ItemMetadata metadata="  " />).container.innerHTML).toBe("");
  });
});

describe("ItemLink", () => {
  it("links a truncated genesis hash to the item page", () => {
    render(<ItemLink genesis="g42df520fb2b94f34af5615babcfef2e" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/item/g42df520fb2b94f34af5615babcfef2e");
    expect(link.textContent).toBe("g42df520…cfef2e");
  });
});
