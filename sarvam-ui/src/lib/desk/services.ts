import type { Service } from "@/lib/api/identitygraph";

/** Mirrors Sarvam_AI/identitygraph/services.py — primary desk templates. */
export const SERVICES: Service[] = [
  {
    id: "link_mobile_aadhaar",
    title: "Link / Update Mobile on Aadhaar",
    tagline: "Seva Kendra classic — voice-fill, verify docs, portal pack.",
    why: "Citizens who struggle with block-letter forms still need to link a mobile to Aadhaar.",
    required_docs: ["Aadhaar Card", "PAN Card", "Bank Passbook"],
    optional_docs: ["Voter ID", "Ration Card"],
    portal: {
      name: "UIDAI Self Service Update Portal / Aadhaar Seva Kendra",
      url: "https://myaadhaar.uidai.gov.in",
    },
    form_fields: [
      {
        key: "full_name",
        label: "Full Name (as on Aadhaar)",
        high_stakes: true,
        compare_to: "full_name",
        compare_doc: "Aadhaar Card",
        prompt_hi: "अपना पूरा नाम बताइए, जैसा आधार कार्ड पर लिखा है।",
        prompt_en: "Please say your full name, exactly as written on Aadhaar.",
      },
      {
        key: "father_name",
        label: "Father's / Guardian's Name",
        high_stakes: true,
        compare_to: "father_name",
        compare_doc: "Aadhaar Card",
      },
      {
        key: "dob",
        label: "Date of Birth",
        high_stakes: true,
        compare_to: "dob",
        compare_doc: "Aadhaar Card",
      },
      {
        key: "aadhaar_number",
        label: "Aadhaar Number",
        high_stakes: true,
        compare_to: "id_number",
        compare_doc: "Aadhaar Card",
      },
      {
        key: "mobile",
        label: "Mobile Number to Link",
        high_stakes: true,
        compare_to: null,
      },
      {
        key: "address",
        label: "Current Address",
        high_stakes: false,
        compare_to: "address",
        compare_doc: "Aadhaar Card",
      },
      {
        key: "reason",
        label: "Reason for Update",
        high_stakes: false,
        compare_to: null,
      },
    ],
  },
  {
    id: "pan_aadhaar_link",
    title: "Link PAN with Aadhaar",
    tagline: "Same desk — tax portal, name-match sensitive.",
    why: "e-Filing and loan KYCs fail when PAN and Aadhaar names diverge.",
    required_docs: ["Aadhaar Card", "PAN Card"],
    optional_docs: ["Bank Passbook"],
    portal: {
      name: "Income Tax e-Filing — Link Aadhaar",
      url: "https://eportal.incometax.gov.in",
    },
    form_fields: [
      {
        key: "full_name",
        label: "Full Name (as on PAN)",
        high_stakes: true,
        compare_to: "full_name",
      },
      {
        key: "pan_number",
        label: "PAN Number",
        high_stakes: true,
        compare_to: "id_number",
        compare_doc: "PAN Card",
      },
      {
        key: "aadhaar_number",
        label: "Aadhaar Number",
        high_stakes: true,
        compare_to: "id_number",
        compare_doc: "Aadhaar Card",
      },
      {
        key: "dob",
        label: "Date of Birth",
        high_stakes: true,
        compare_to: "dob",
      },
      {
        key: "mobile",
        label: "Registered Mobile",
        high_stakes: true,
        compare_to: null,
      },
    ],
  },
  {
    id: "rto_dl_update",
    title: "RTO — Driving Licence Address / Name Update",
    tagline: "Parivahan Sarathi desk — same manual pain, same validation need.",
    why: "RTO counters still run on paper/Sarathi forms.",
    required_docs: ["Driving License", "Aadhaar Card"],
    optional_docs: ["Bank Passbook", "Ration Card"],
    portal: {
      name: "Parivahan Sarathi — Change of Address / Name in DL",
      url: "https://sarathi.parivahan.gov.in",
    },
    form_fields: [
      { key: "full_name", label: "Full Name", high_stakes: true, compare_to: "full_name" },
      {
        key: "dl_number",
        label: "Driving Licence Number",
        high_stakes: true,
        compare_to: "id_number",
        compare_doc: "Driving License",
      },
      { key: "dob", label: "Date of Birth", high_stakes: true, compare_to: "dob" },
      { key: "mobile", label: "Mobile Number", high_stakes: true, compare_to: null },
      { key: "change_type", label: "What to Change", high_stakes: true, compare_to: null },
      {
        key: "old_address",
        label: "Address on Current DL",
        high_stakes: false,
        compare_to: "address",
        compare_doc: "Driving License",
      },
      {
        key: "new_address",
        label: "New Address (with pincode)",
        high_stakes: true,
        compare_to: "address",
        compare_doc: "Aadhaar Card",
      },
    ],
  },
  {
    id: "scheme_apply",
    title: "Gov Scheme Discovery + Darkhast (Application)",
    tagline: "Find the scheme, check eligibility, fill the application correctly.",
    why: "Applications bounce on income/category/Aadhaar-mobile mismatch.",
    required_docs: ["Aadhaar Card", "Ration Card"],
    optional_docs: ["Bank Passbook", "School Certificate"],
    portal: {
      name: "National / State scheme portals (via CSC)",
      url: "https://www.myscheme.gov.in",
    },
    form_fields: [
      { key: "full_name", label: "Applicant Full Name", high_stakes: true, compare_to: "full_name" },
      {
        key: "aadhaar_number",
        label: "Aadhaar Number",
        high_stakes: true,
        compare_to: "id_number",
        compare_doc: "Aadhaar Card",
      },
      { key: "dob", label: "Date of Birth", high_stakes: true, compare_to: "dob" },
      { key: "mobile", label: "Mobile (Aadhaar-linked)", high_stakes: true, compare_to: null },
      { key: "address", label: "Address with pincode", high_stakes: true, compare_to: "address" },
      { key: "scheme_name", label: "Scheme Name", high_stakes: true, compare_to: null },
      { key: "category", label: "Category (SC/ST/OBC/EWS/General)", high_stakes: true, compare_to: null },
      {
        key: "annual_income",
        label: "Approx Annual Family Income (₹)",
        high_stakes: true,
        compare_to: null,
      },
    ],
  },
  {
    id: "grievance_complaint",
    title: "File a Government Service Complaint",
    tagline: "When the update/scheme already failed — capture a factual, portal-ready grievance.",
    why: "Vague darkhasts get closed. Force department, facts, desired outcome.",
    required_docs: ["Aadhaar Card"],
    optional_docs: ["Rejection letter", "Acknowledgement receipt"],
    portal: {
      name: "CPGRAMS / State public grievance portal",
      url: "https://pgportal.gov.in",
    },
    form_fields: [
      { key: "full_name", label: "Full Name", high_stakes: true, compare_to: "full_name" },
      { key: "mobile", label: "Mobile", high_stakes: true, compare_to: null },
      {
        key: "aadhaar_number",
        label: "Aadhaar Number",
        high_stakes: true,
        compare_to: "id_number",
        compare_doc: "Aadhaar Card",
      },
      { key: "department", label: "Department / Office", high_stakes: true, compare_to: null },
      {
        key: "complaint_summary",
        label: "What Happened (facts)",
        high_stakes: true,
        compare_to: null,
      },
      {
        key: "desired_outcome",
        label: "What You Want Done",
        high_stakes: true,
        compare_to: null,
      },
    ],
  },
];

export function getService(id: string) {
  const s = SERVICES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown service: ${id}`);
  return s;
}
