import { buildCase } from "./reconcile";
import type { IdentityDocument } from "./types";

/** Demo stack: Mohd / Mohammed + DOB year clash on PAN + wet-stamp uncertain DOB on bank. */
const documents: IdentityDocument[] = [
  {
    id: "doc-aadhaar",
    type: "aadhaar",
    label: "Aadhaar",
    issuer: "UIDAI",
    scannedAt: "2026-07-20",
    fields: {
      full_name: {
        value: "Mohammed Aslam",
        bbox: { x: 28, y: 38, w: 44, h: 6 },
      },
      father_name: {
        value: "Abdul Rahman",
        bbox: { x: 28, y: 46, w: 40, h: 5 },
      },
      dob: {
        value: "12/03/1988",
        bbox: { x: 28, y: 54, w: 28, h: 5 },
      },
      gender: {
        value: "Male",
        bbox: { x: 60, y: 54, w: 16, h: 5 },
      },
      address: {
        value: "12, 2nd Cross, Indiranagar, Bengaluru 560038",
        bbox: { x: 18, y: 68, w: 64, h: 12 },
      },
      id_number: {
        value: "XXXX XXXX 4521",
        bbox: { x: 28, y: 22, w: 40, h: 6 },
      },
    },
  },
  {
    id: "doc-pan",
    type: "pan",
    label: "PAN Card",
    issuer: "Income Tax Dept.",
    scannedAt: "2026-07-20",
    fields: {
      full_name: {
        value: "Mohd Aslam",
        bbox: { x: 22, y: 42, w: 48, h: 7 },
      },
      father_name: {
        value: "Abdul Rahman",
        bbox: { x: 22, y: 52, w: 44, h: 6 },
      },
      dob: {
        value: "12/03/1989",
        bbox: { x: 22, y: 62, w: 30, h: 6 },
        note: "Year differs from Aadhaar — critical blocker for passport / KYC.",
      },
      id_number: {
        value: "BKMPA1234F",
        bbox: { x: 22, y: 28, w: 36, h: 6 },
      },
    },
  },
  {
    id: "doc-voter",
    type: "voter",
    label: "Voter ID",
    issuer: "ECI",
    scannedAt: "2026-07-20",
    fields: {
      full_name: {
        value: "Mohammad Aslam",
        bbox: { x: 30, y: 40, w: 46, h: 6 },
      },
      father_name: {
        value: "Abdul Rehman",
        bbox: { x: 30, y: 48, w: 42, h: 5 },
      },
      dob: {
        value: "12-03-1988",
        bbox: { x: 30, y: 56, w: 28, h: 5 },
      },
      gender: {
        value: "M",
        bbox: { x: 62, y: 56, w: 10, h: 5 },
      },
      address: {
        value: "No.12, 2nd Cross Rd, Indiranagar, Bangalore",
        bbox: { x: 20, y: 66, w: 60, h: 12 },
      },
      id_number: {
        value: "ABC1234567",
        bbox: { x: 30, y: 24, w: 34, h: 5 },
      },
    },
  },
  {
    id: "doc-bank",
    type: "bank",
    label: "Bank Passbook",
    issuer: "SBI",
    scannedAt: "2026-07-20",
    fields: {
      full_name: {
        value: "MOHD. ASLAM",
        bbox: { x: 24, y: 32, w: 50, h: 6 },
      },
      dob: {
        value: "?? / 03 / 1988",
        statusHint: "uncertain",
        bbox: { x: 24, y: 48, w: 32, h: 7 },
        note: "Day obscured by wet stamp — UNCERTAIN, not hallucinated.",
      },
      address: {
        value: "12, 2nd Cross, Indiranagar, Bengaluru",
        bbox: { x: 24, y: 58, w: 56, h: 10 },
      },
      id_number: {
        value: "A/C ****7821",
        bbox: { x: 24, y: 20, w: 36, h: 5 },
      },
    },
  },
  {
    id: "doc-school",
    type: "school",
    label: "School Certificate",
    issuer: "Karnataka SSLC Board",
    scannedAt: "2026-07-20",
    fields: {
      full_name: {
        value: "Mohammed Aslam",
        bbox: { x: 26, y: 36, w: 48, h: 6 },
      },
      father_name: {
        value: "Abdul Rahman",
        bbox: { x: 26, y: 44, w: 40, h: 5 },
      },
      dob: {
        value: "12 March 1988",
        bbox: { x: 26, y: 52, w: 36, h: 5 },
      },
      id_number: {
        value: "SSLC/88/10442",
        bbox: { x: 26, y: 22, w: 38, h: 5 },
      },
    },
  },
];

export const DEMO_CASE_ID = "case-aslam-demo";

export function getDemoCase() {
  return buildCase(DEMO_CASE_ID, "Mohammed Aslam", documents);
}
