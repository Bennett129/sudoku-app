import { describe, expect, it } from "vitest";
import {
  SUPPORTED_SIZES,
  boxShapeFor,
  createRng,
  generateSolution,
  isValidSolution,
  peersOf,
  specFor,
  symbolFor,
  valueForKeyCode,
} from "./index";

describe("sizes", () => {
  it("picks the most square box shape", () => {
    expect(boxShapeFor(6)).toEqual({ rows: 2, cols: 3 });
    expect(boxShapeFor(9)).toEqual({ rows: 3, cols: 3 });
    expect(boxShapeFor(12)).toEqual({ rows: 3, cols: 4 });
    expect(boxShapeFor(25)).toEqual({ rows: 5, cols: 5 });
  });

  it("rejects prime sizes", () => {
    expect(() => boxShapeFor(7)).toThrow();
    expect(() => boxShapeFor(5)).toThrow();
  });
});

describe("generateSolution", () => {
  it.each(SUPPORTED_SIZES)("produces a valid %i×%i grid", (size) => {
    const spec = specFor(size);
    for (let seed = 1; seed <= 5; seed++) {
      expect(isValidSolution(spec, generateSolution(spec, createRng(seed)))).toBe(true);
    }
  });

  it("is reproducible from a seed", () => {
    const spec = specFor(9);
    expect(generateSolution(spec, createRng(42))).toEqual(generateSolution(spec, createRng(42)));
  });
});

describe("geometry", () => {
  it("gives each 9×9 cell 20 peers", () => {
    expect(peersOf(specFor(9)).every((p) => p.length === 20)).toBe(true);
  });
});

describe("symbols and keys", () => {
  it("maps 1–9 then A–P", () => {
    expect(symbolFor(9)).toBe("9");
    expect(symbolFor(10)).toBe("A");
    expect(symbolFor(25)).toBe("P");
  });

  it("maps key codes within the grid size only", () => {
    expect(valueForKeyCode("Digit4", 4)).toBe(4);
    expect(valueForKeyCode("Digit5", 4)).toBeNull();
    expect(valueForKeyCode("KeyA", 16)).toBe(10);
    expect(valueForKeyCode("KeyP", 25)).toBe(25);
    expect(valueForKeyCode("KeyQ", 25)).toBeNull();
    expect(valueForKeyCode("Numpad7", 9)).toBe(7);
  });
});
