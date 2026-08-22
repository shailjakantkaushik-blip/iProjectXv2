/**
 * iProjectX platform / demo org shape (not a customer tenant).
 * Numbers match scripts/generate-seed-16.mjs.
 */
export const PLATFORM_SEED_PROJECTS = [
  { code: "PRJ-001", name: "Customer Portal Redesign", program: "Digital Transformation", status: "In Progress", rag: "Green", method: "Hybrid", budget: 3_200_000, capexA: 2_500_000, capexI: 1_100_000, opexA: 700_000, opexI: 280_000, fac: 3_300_000, benT: 5_200_000, benR: 900_000, start: "2025-04-01", end: "2026-09-30" },
  { code: "PRJ-002", name: "Core Banking API Platform", program: "Platform Modernisation", status: "In Progress", rag: "Amber", method: "Agile", budget: 5_800_000, capexA: 4_800_000, capexI: 3_100_000, opexA: 1_000_000, opexI: 620_000, fac: 6_100_000, benT: 9_500_000, benR: 1_200_000, start: "2024-10-01", end: "2026-06-30" },
  { code: "PRJ-003", name: "Data Lakehouse Foundation", program: "Data & Analytics", status: "In Progress", rag: "Green", method: "Waterfall", budget: 4_100_000, capexA: 3_500_000, capexI: 900_000, opexA: 600_000, opexI: 150_000, fac: 4_200_000, benT: 7_000_000, benR: 200_000, start: "2025-07-01", end: "2027-03-31" },
  { code: "PRJ-004", name: "Cyber Resilience Uplift", program: "Risk & Compliance", status: "In Progress", rag: "Amber", method: "Hybrid", budget: 2_700_000, capexA: 2_000_000, capexI: 400_000, opexA: 700_000, opexI: 180_000, fac: 2_850_000, benT: 3_500_000, benR: 0, start: "2025-11-01", end: "2026-12-31" },
  { code: "PRJ-005", name: "Contact Centre Omnichannel", program: "Customer Experience", status: "In Progress", rag: "Green", method: "Agile", budget: 1_900_000, capexA: 1_400_000, capexI: 1_250_000, opexA: 500_000, opexI: 410_000, fac: 1_950_000, benT: 3_100_000, benR: 1_800_000, start: "2024-08-01", end: "2026-04-30" },
  { code: "PRJ-006", name: "Finance Close Automation", program: "Finance Transformation", status: "In Progress", rag: "Green", method: "Waterfall", budget: 1_500_000, capexA: 1_100_000, capexI: 1_050_000, opexA: 400_000, opexI: 360_000, fac: 1_520_000, benT: 2_400_000, benR: 1_600_000, start: "2024-05-01", end: "2026-02-28" },
  { code: "PRJ-007", name: "HR Self-Service Suite", program: "People Systems", status: "In Progress", rag: "Amber", method: "Hybrid", budget: 1_200_000, capexA: 900_000, capexI: 450_000, opexA: 300_000, opexI: 120_000, fac: 1_280_000, benT: 1_800_000, benR: 150_000, start: "2025-06-01", end: "2026-08-31" },
  { code: "PRJ-008", name: "Supplier Portal 2.0", program: "Procurement", status: "In Progress", rag: "Green", method: "Agile", budget: 980_000, capexA: 750_000, capexI: 80_000, opexA: 230_000, opexI: 20_000, fac: 1_000_000, benT: 1_600_000, benR: 0, start: "2026-01-15", end: "2026-12-15" },
  { code: "PRJ-009", name: "Branch Network WiFi Refresh", program: "Infrastructure", status: "In Progress", rag: "Red", method: "Waterfall", budget: 2_200_000, capexA: 2_000_000, capexI: 1_600_000, opexA: 200_000, opexI: 150_000, fac: 2_550_000, benT: 1_800_000, benR: 200_000, start: "2025-02-01", end: "2026-05-31" },
  { code: "PRJ-010", name: "Regulatory Reporting Engine", program: "Risk & Compliance", status: "In Progress", rag: "Amber", method: "Hybrid", budget: 3_600_000, capexA: 2_900_000, capexI: 1_400_000, opexA: 700_000, opexI: 300_000, fac: 3_750_000, benT: 4_200_000, benR: 400_000, start: "2025-03-01", end: "2026-11-30" },
  { code: "PRJ-011", name: "Mobile App Payments", program: "Digital Transformation", status: "In Progress", rag: "Green", method: "Agile", budget: 2_800_000, capexA: 2_200_000, capexI: 250_000, opexA: 600_000, opexI: 80_000, fac: 2_900_000, benT: 6_000_000, benR: 0, start: "2025-12-01", end: "2027-06-30" },
  { code: "PRJ-012", name: "Cloud Cost Optimisation", program: "Platform Modernisation", status: "Completed", rag: "Green", method: "Agile", budget: 650_000, capexA: 200_000, capexI: 195_000, opexA: 450_000, opexI: 440_000, fac: 640_000, benT: 1_500_000, benR: 1_450_000, start: "2024-04-01", end: "2025-12-31" },
  { code: "PRJ-013", name: "Claims Straight-Through", program: "Operations Excellence", status: "In Progress", rag: "Green", method: "Hybrid", budget: 3_400_000, capexA: 2_700_000, capexI: 700_000, opexA: 700_000, opexI: 160_000, fac: 3_500_000, benT: 5_500_000, benR: 100_000, start: "2025-08-01", end: "2027-02-28" },
  { code: "PRJ-014", name: "ESG Data Platform", program: "Data & Analytics", status: "Not Started", rag: "Green", method: "Waterfall", budget: 1_100_000, capexA: 850_000, capexI: 0, opexA: 250_000, opexI: 0, fac: 1_100_000, benT: 900_000, benR: 0, start: "2026-04-01", end: "2027-03-31" },
  { code: "PRJ-015", name: "Legacy Policy Admin Decommission", program: "Platform Modernisation", status: "In Progress", rag: "Amber", method: "Waterfall", budget: 4_500_000, capexA: 3_800_000, capexI: 2_900_000, opexA: 700_000, opexI: 500_000, fac: 4_800_000, benT: 6_200_000, benR: 2_100_000, start: "2024-06-01", end: "2026-07-31" },
  { code: "PRJ-016", name: "AI Document Intake", program: "Operations Excellence", status: "In Progress", rag: "Green", method: "Agile", budget: 1_750_000, capexA: 1_300_000, capexI: 600_000, opexA: 450_000, opexI: 180_000, fac: 1_800_000, benT: 3_200_000, benR: 450_000, start: "2025-09-01", end: "2026-10-31" },
] as const;

export const PLATFORM_WATERFALL_GATES = [
  "Discovery",
  "Business Case / Seed Funding",
  "Design",
  "Business Case / Full Funding",
  "Build",
  "Testing",
  "Deployment",
  "Handover",
  "Benefit Realisation",
] as const;
