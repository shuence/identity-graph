"use client";

import { getDemoCase } from "./demo-case";
import type { IdentityCase } from "./types";

const KEY = "identitygraph.cases";

export function loadCases(): IdentityCase[] {
  if (typeof window === "undefined") return [getDemoCase()];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const demo = getDemoCase();
      localStorage.setItem(KEY, JSON.stringify([demo]));
      return [demo];
    }
    return JSON.parse(raw) as IdentityCase[];
  } catch {
    return [getDemoCase()];
  }
}

export function saveCase(identityCase: IdentityCase) {
  const cases = loadCases().filter((c) => c.id !== identityCase.id);
  cases.unshift(identityCase);
  localStorage.setItem(KEY, JSON.stringify(cases));
}

export function getCase(id: string): IdentityCase | undefined {
  return loadCases().find((c) => c.id === id) ?? (id === getDemoCase().id ? getDemoCase() : undefined);
}

export function ensureDemoCase(): IdentityCase {
  const demo = getDemoCase();
  saveCase(demo);
  return demo;
}
