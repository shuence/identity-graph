"use client";

import type { IdentityCase } from "./types";

const KEY = "identitygraph.cases";

export function loadCases(): IdentityCase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as IdentityCase[];
  } catch {
    return [];
  }
}

export function saveCase(identityCase: IdentityCase) {
  const cases = loadCases().filter((c) => c.id !== identityCase.id);
  cases.unshift(identityCase);
  localStorage.setItem(KEY, JSON.stringify(cases));
}

export function getCase(id: string): IdentityCase | undefined {
  return loadCases().find((c) => c.id === id);
}
