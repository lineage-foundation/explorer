import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Mono, Heading, Eyebrow, Badge, EmptyState, Container } from "../index.js";

describe("display primitives", () => {
  it("Mono renders mono font", () => {
    render(<Mono>abc123</Mono>);
    expect(screen.getByText("abc123").className).toContain("font-mono");
  });
  it("Heading renders the requested heading level", () => {
    render(<Heading level={2}>Blocks</Heading>);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Blocks");
  });
  it("Eyebrow renders uppercase mono label", () => {
    render(<Eyebrow>Transaction</Eyebrow>);
    expect(screen.getByText("Transaction").className).toContain("uppercase");
  });
  it("Badge accent tone uses the accent token", () => {
    render(<Badge tone="accent">token</Badge>);
    expect(screen.getByText("token").className).toContain("text-accent");
  });
  it("EmptyState shows title and hint", () => {
    render(<EmptyState title="Nothing here" hint="try again" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("try again")).toBeInTheDocument();
  });
  it("Container narrow width applies a max width", () => {
    render(<Container width="narrow">x</Container>);
    expect(screen.getByText("x").className).toContain("max-w-3xl");
  });
});
