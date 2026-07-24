-- ============================================================
-- A) Expression of Interest (eoi_requests)
-- B) License Certificates (org_license_certificates)
-- C) Legal Policies (legal_policies)
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- A) EOI requests
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eoi_requests (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  full_name        text        NOT NULL,
  email            text        NOT NULL,
  organization_name text,
  phone            text,
  job_title        text,
  company_size     text,
  interest_areas   text,
  message          text,
  status           text        NOT NULL DEFAULT 'New',
  notes            text,
  source           text        NOT NULL DEFAULT 'landing',
  CONSTRAINT eoi_status_check CHECK (status IN ('New','Contacted','Qualified','Closed'))
);

ALTER TABLE public.eoi_requests ENABLE ROW LEVEL SECURITY;

-- Anon + authenticated can INSERT (submit from landing page without login)
CREATE POLICY "eoi_insert_public"
  ON public.eoi_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only platform admins can SELECT
CREATE POLICY "eoi_select_platform_admin"
  ON public.eoi_requests FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Only platform admins can UPDATE (e.g. change status, add notes)
CREATE POLICY "eoi_update_platform_admin"
  ON public.eoi_requests FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- ──────────────────────────────────────────────────────────
-- B) Org license certificates
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_license_certificates (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  org_id             uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  certificate_number text        NOT NULL UNIQUE,
  issued_at          date        NOT NULL DEFAULT CURRENT_DATE,
  expires_at         date,
  plan_code          text,
  seats              int         NOT NULL DEFAULT 1,
  status             text        NOT NULL DEFAULT 'Active',
  pdf_meta           jsonb       NOT NULL DEFAULT '{}',
  issued_by          text,
  CONSTRAINT cert_status_check CHECK (status IN ('Active','Revoked','Expired'))
);

ALTER TABLE public.org_license_certificates ENABLE ROW LEVEL SECURITY;

-- Platform admins can do everything
CREATE POLICY "cert_platform_admin_all"
  ON public.org_license_certificates FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Org admins can read their own org's certificates
CREATE POLICY "cert_org_admin_select"
  ON public.org_license_certificates FOR SELECT
  TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.org_id  = public.get_user_org(auth.uid())
        AND ur.role::text IN ('admin','org_admin')
    )
  );

-- ──────────────────────────────────────────────────────────
-- C) Legal policies
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.legal_policies (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        NOT NULL UNIQUE,
  title         text        NOT NULL,
  category      text        NOT NULL DEFAULT 'Legal',
  body_markdown text        NOT NULL DEFAULT '',
  sort_order    int         NOT NULL DEFAULT 0,
  published     boolean     NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.legal_policies ENABLE ROW LEVEL SECURITY;

-- Platform admins manage policies
CREATE POLICY "policies_platform_admin_all"
  ON public.legal_policies FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- All authenticated users (and anon) can read published policies
CREATE POLICY "policies_public_select"
  ON public.legal_policies FOR SELECT
  TO anon, authenticated
  USING (published = true);

-- ──────────────────────────────────────────────────────────
-- Seed legal_policies with placeholder drafts
-- ──────────────────────────────────────────────────────────
INSERT INTO public.legal_policies (slug, title, category, sort_order, published, body_markdown) VALUES
-- Legal
('privacy-policy',         'Privacy Policy',                       'Legal',                      10, true,
'# Privacy Policy

*Last updated: [Date]*

## 1. Introduction
[Organization Name] ("we", "us", "our") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information.

## 2. Information We Collect
- **Account information**: name, email address, organization name
- **Usage data**: pages visited, features used, session duration
- **Technical data**: IP address, browser type, device identifiers

## 3. How We Use Your Information
We use collected information to provide, maintain, and improve our services, communicate with you, and comply with legal obligations.

## 4. Data Sharing
We do not sell your personal data. We may share data with trusted service providers under strict confidentiality agreements.

## 5. Your Rights
Depending on your jurisdiction you may have rights to access, correct, delete, or port your personal data. Contact us at [privacy@example.com].

## 6. Contact
[Organization Name], [Address]. Email: [privacy@example.com]
'),

('terms-of-service',       'Terms of Service',                     'Legal',                      20, true,
'# Terms of Service

*Last updated: [Date]*

## 1. Acceptance
By accessing or using our platform you agree to these Terms. If you do not agree, do not use the service.

## 2. License
We grant you a limited, non-exclusive, non-transferable licence to use the platform for your internal business purposes.

## 3. Prohibited Uses
You may not: reverse-engineer the platform; use it for unlawful purposes; resell or sublicense access without written consent.

## 4. Termination
Either party may terminate with [30] days written notice. We may suspend immediately for material breach.

## 5. Limitation of Liability
To the maximum extent permitted by law, our total liability shall not exceed the fees paid in the 12 months preceding the claim.

## 6. Governing Law
These Terms are governed by the laws of [Jurisdiction].
'),

('cookie-policy',          'Cookie Policy',                        'Legal',                      30, true,
'# Cookie Policy

*Last updated: [Date]*

## What Are Cookies?
Cookies are small text files stored on your device when you visit our platform.

## Cookies We Use
| Category       | Purpose                                 | Duration |
|----------------|-----------------------------------------|----------|
| Essential       | Authentication, security, session state | Session  |
| Analytics       | Usage statistics (anonymised)           | 12 months|
| Preferences     | UI settings, theme, language            | 12 months|

## Managing Cookies
You may disable cookies through your browser settings; this may affect platform functionality.

## Contact
[privacy@example.com]
'),

('acceptable-use',         'Acceptable Use Policy',                'Legal',                      40, true,
'# Acceptable Use Policy

*Last updated: [Date]*

## Overview
This policy governs how you may use our platform. Violations may result in suspension or termination.

## Prohibited Activities
- Uploading malicious code or interfering with platform integrity
- Attempting to gain unauthorized access to other accounts or systems
- Using the platform to send spam or conduct phishing
- Violating any applicable law or regulation

## Reporting Violations
Report violations to [security@example.com].
'),

('refund-cancellation',    'Refund & Cancellation Policy',         'Legal',                      50, true,
'# Refund & Cancellation Policy

*Last updated: [Date]*

## Cancellations
You may cancel your subscription at any time. Access continues until the end of the current billing period.

## Refunds
Fees paid are generally non-refundable. Exceptions may be granted at our discretion for:
- Platform outages exceeding our SLA commitments
- Billing errors on our part

## How to Cancel
Contact [billing@example.com] or use the self-service option in your account settings.
'),

-- Security & Compliance
('information-security',   'Information Security Policy',          'Security & Compliance',      10, true,
'# Information Security Policy

*Last updated: [Date]*

## Commitment
We implement industry-standard security controls to protect customer data.

## Key Controls
- **Encryption**: data encrypted in transit (TLS 1.2+) and at rest (AES-256)
- **Access control**: least-privilege, MFA for admin access
- **Vulnerability management**: regular scanning and patching cycles
- **Penetration testing**: annual third-party tests

## Reporting Security Issues
Responsible disclosure: [security@example.com]
'),

('data-processing-agreement', 'Data Processing Agreement',        'Security & Compliance',      20, true,
'# Data Processing Agreement (DPA)

*Last updated: [Date]*

This DPA forms part of the Master Services Agreement between [Organization Name] (Processor) and the Customer (Controller).

## 1. Scope
We process personal data solely to deliver the contracted services.

## 2. Sub-processors
A current list of approved sub-processors is available on request.

## 3. Data Subject Rights
We assist Customers in responding to data subject requests within [30] days.

## 4. Security Measures
See our Information Security Policy.

## 5. Breach Notification
We notify Customers of personal data breaches within [72] hours of becoming aware.
'),

('data-retention',         'Data Retention Policy',                'Security & Compliance',      30, true,
'# Data Retention Policy

*Last updated: [Date]*

## Retention Periods
| Data Category        | Retention Period      | Basis                |
|----------------------|-----------------------|----------------------|
| Account data         | Duration of contract + 7 years | Legal/audit |
| Project records      | Duration of contract + 3 years | Contractual  |
| Audit logs           | 2 years               | Security             |
| Support tickets      | 3 years               | Service improvement  |
| Anonymised analytics | Indefinite            | Aggregated only      |

## Deletion
Upon contract termination, customer data is purged within [90] days unless retention is required by law.
'),

('incident-response',      'Incident Response Policy',             'Security & Compliance',      40, true,
'# Incident Response Policy

*Last updated: [Date]*

## Classification
| Severity | Description                                | Response Time |
|----------|--------------------------------------------|---------------|
| P1       | Service unavailable, data breach suspected | 1 hour        |
| P2       | Significant feature degradation            | 4 hours       |
| P3       | Minor functionality issue                  | 1 business day|

## Process
1. Detection & triage
2. Containment
3. Eradication & recovery
4. Post-incident review
5. Customer notification (per SLA / DPA obligations)

## Contact
[security@example.com]
'),

-- Customer Information
('about',                  'About Us',                             'Customer Information',       10, true,
'# About Us

[Organization Name] provides an enterprise PMO command centre platform that helps organisations govern their project portfolios with live dashboards, financial controls, and RAID governance.

## Our Mission
To give every PMO the single, immutable source of truth they need to deliver strategic value consistently.

## Contact
- General enquiries: [hello@example.com]
- Support: [support@example.com]
- LinkedIn / Twitter: [links]
'),

('pricing-plans',          'Pricing & Plans',                      'Customer Information',       20, true,
'# Pricing & Plans

*Current as at [Date]*

Our plans are designed for teams of all sizes. All plans include core PMO features; higher tiers unlock advanced analytics, API access, and white-labelling.

Please contact us for current pricing or use the pricing page in the platform.

## Enterprise
Custom pricing for large organisations with dedicated onboarding and a named customer success manager.

Contact [sales@example.com] for a quote.
'),

('sla',                    'Service Level Agreement (SLA)',         'Customer Information',       30, true,
'# Service Level Agreement

*Last updated: [Date]*

## Uptime Commitment
We target **99.5% monthly uptime** for the production environment.

## Exclusions
Scheduled maintenance (notified ≥ 48 h in advance) is excluded from uptime calculations.

## Credits
| Monthly uptime | Credit      |
|----------------|-------------|
| 99.0 – 99.5%   | 5% of MRR   |
| 95.0 – 99.0%   | 10% of MRR  |
| < 95.0%        | 25% of MRR  |

Credits are applied to the next invoice. Contact [support@example.com] within [30] days of the incident.
'),

('support-help',           'Support & Help Centre',                'Customer Information',       40, true,
'# Support & Help Centre

*Last updated: [Date]*

## Getting Help
- **In-app help**: use the "?" icon for context-sensitive guidance
- **Email support**: [support@example.com] (response within 1 business day on Business plan; 4 hours on Enterprise)
- **Documentation**: [docs.example.com]

## Scope of Support
Support covers platform usage questions, bug reports, and account management. Consulting and custom development are out of scope for standard support.
'),

('system-status',          'System Status',                        'Customer Information',       50, true,
'# System Status

*Last updated: [Date]*

Visit our live status page at [status.example.com] for real-time uptime, incident history, and scheduled maintenance notices.

## Subscribe to Updates
Sign up for email or webhook notifications on the status page.
'),

-- Notices
('customer-responsibilities', 'Customer Responsibilities',         'Notices',                    10, true,
'# Customer Responsibilities

*Last updated: [Date]*

## Your Obligations
As a customer you agree to:

- Maintain accurate account information
- Keep login credentials confidential and notify us immediately of any suspected breach
- Ensure users of your account comply with our Acceptable Use Policy
- Not exceed the seat limits of your licence
- Provide reasonable cooperation for security reviews or audits upon request
'),

('ai-usage-disclosure',    'AI Usage Disclosure',                  'Notices',                    20, true,
'# AI Usage Disclosure

*Last updated: [Date]*

## AI Features
Our platform includes AI-assisted features (e.g. AI Assist, narrative generation) powered by third-party large-language model providers.

## Data Handling
Prompts and generated outputs may be processed by our AI provider under their data processing terms. We configure our providers to opt out of training on customer data where available.

## Human Oversight
AI-generated content is advisory only. You are responsible for reviewing and validating any AI output before acting on it.

## Providers
Current AI sub-processors: [list provider(s) and link to their privacy policies].
'),

('disclaimer',             'Disclaimer',                           'Notices',                    30, true,
'# Disclaimer

*Last updated: [Date]*

The information provided within the platform and associated documentation is for general informational purposes only. It does not constitute legal, financial, or professional advice.

While we strive for accuracy, we make no warranties or representations regarding the completeness or accuracy of information. Use of the platform is at your own risk.
'),

('contact-complaints',     'Contact & Complaints',                 'Notices',                    40, true,
'# Contact & Complaints

*Last updated: [Date]*

## General Contact
- Email: [hello@example.com]
- Address: [Physical address]

## Support
[support@example.com]

## Privacy & Data
[privacy@example.com]

## Complaints Process
If you have a complaint, please email [complaints@example.com] with:
1. Your name and account details
2. A description of the issue
3. The outcome you are seeking

We aim to respond within [10] business days.

If unresolved, you may escalate to the relevant regulatory body in your jurisdiction.
')

ON CONFLICT (slug) DO NOTHING;
