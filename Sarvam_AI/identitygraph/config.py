"""Field definitions, document types, and remediation portal routing."""

# Identity fields we reconcile across documents. Order matters for display.
FIELDS = [
    ("full_name", "Full Name"),
    ("father_name", "Father's / Guardian's Name"),
    ("dob", "Date of Birth"),
    ("address", "Address"),
    ("id_number", "Document ID Number"),
]

FIELD_LABELS = dict(FIELDS)

DOC_TYPES = [
    "Aadhaar Card",
    "PAN Card",
    "Voter ID",
    "Ration Card",
    "Bank Passbook",
    "School Certificate",
    "Driving License",
    "Passport",
    "Rejection letter",
    "Acknowledgement receipt",
    "Other",
]

# Which office/portal fixes an error on each document type.
REMEDIATION_PORTALS = {
    "Aadhaar Card": {
        "portal": "UIDAI Self Service Update Portal (SSUP)",
        "url": "https://myaadhaar.uidai.gov.in",
        "how": "Online update for name/DOB/address with a supporting document, "
               "or visit any Aadhaar Seva Kendra for biometric-verified corrections.",
    },
    "PAN Card": {
        "portal": "Protean (NSDL) PAN correction — Form 49A 'Changes/Correction'",
        "url": "https://www.protean-tinpan.com",
        "how": "File the online correction form, pay the fee, and courier signed proof. "
               "Aadhaar-PAN name match is checked automatically, so fix Aadhaar first if it is the source of truth.",
    },
    "Voter ID": {
        "portal": "Voters' Service Portal — Form 8 (correction of entries)",
        "url": "https://voters.eci.gov.in",
        "how": "Submit Form 8 online with a scan of the corrected base document.",
    },
    "Ration Card": {
        "portal": "State Food & Civil Supplies portal / nearest CSC",
        "url": "https://nfsa.gov.in",
        "how": "Correction procedure varies by state; most accept applications at Common Service Centres.",
    },
    "Bank Passbook": {
        "portal": "Home branch KYC update",
        "url": "",
        "how": "Submit a KYC modification form at the home branch with the corrected primary document (usually Aadhaar/PAN).",
    },
    "School Certificate": {
        "portal": "Issuing board's correction cell (e.g. CBSE/State board)",
        "url": "",
        "how": "Boards require a gazette notification or affidavit for name changes; DOB corrections need the original admission record.",
    },
    "Driving License": {
        "portal": "Parivahan Sarathi portal",
        "url": "https://sarathi.parivahan.gov.in",
        "how": "Apply for 'Change of Name/DOB/Address in DL' with supporting documents.",
    },
    "Passport": {
        "portal": "Passport Seva portal — re-issue with changed particulars",
        "url": "https://www.passportindia.gov.in",
        "how": "Apply for re-issue citing change in personal particulars; carry originals of the corrected base documents.",
    },
    "Other": {
        "portal": "Issuing authority of the document",
        "url": "",
        "how": "Contact the issuing office with the corrected primary documents.",
    },
}

# Languages supported by Sarvam Document Intelligence (subset shown in UI).
LANGUAGES = {
    "English": "en-IN",
    "Hindi": "hi-IN",
    "Marathi": "mr-IN",
    "Bengali": "bn-IN",
    "Tamil": "ta-IN",
    "Telugu": "te-IN",
    "Kannada": "kn-IN",
    "Malayalam": "ml-IN",
    "Gujarati": "gu-IN",
    "Punjabi": "pa-IN",
    "Odia": "od-IN",
    "Urdu": "ur-IN",
}
