import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { CopyButton } from "../CopyButton.js";

function stubClipboard(writeText: (v: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CopyButton", () => {
  it("writes the value to the clipboard and confirms via a live region", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<CopyButton value="0xdeadbeef" />);
    fireEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("0xdeadbeef");
    expect(await screen.findByText("copied")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Copied to clipboard");
  });

  it("shows a failure state and does not throw when the clipboard rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubClipboard(writeText);
    render(<CopyButton value="x" />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Copy failed");
  });

  it("has a stable, descriptive accessible name", () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    render(<CopyButton value="x" label="hash" />);
    expect(screen.getByRole("button", { name: "Copy hash" })).toBeInTheDocument();
  });
});
