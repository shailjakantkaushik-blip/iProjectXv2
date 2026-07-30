-- Refresh legal policy bodies for current product capabilities:
-- mandatory TOTP MFA, optional per-org SSO, optional BYOD customer DB,
-- In-house AI default + Approved Open AI opt-in, security posture.

-- ──────────────────────────────────────────────────────────
-- information-security
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX maintains an information security program designed to protect the confidentiality, integrity, and availability of the iProjectX platform, Customer Content, and related systems. This Information Security Policy summarises our approach for customers and prospects.

## 1. Governance

Security responsibilities are assigned within iProjectX. We review controls periodically, align practices with industry norms appropriate to a SaaS project-management platform, and require personnel with access to Customer Content to follow confidentiality and acceptable-use obligations.

## 2. Encryption

- **In transit:** Connections to the Services use TLS encryption for web and API traffic.
- **At rest:** Customer Content and databases are protected using encryption at rest provided by our infrastructure providers and platform configuration.
- Secrets such as API keys, BYOD customer database credentials, and other credentials are stored using secure secret-management practices (including AES-256-GCM encryption for BYOD secrets at rest) and are not committed to source control.

## 3. Access Controls

Access to production systems follows least privilege and need-to-know principles. Administrative access is authenticated, logged, and limited to authorised personnel. Customer organisations control end-user roles and permissions within their workspaces.

**Multi-factor authentication (MFA).** Every user must enroll and use a TOTP authenticator app (time-based one-time passwords). MFA cannot be disabled in-product. Sessions use PKCE and are stored in sessionStorage (not long-lived JWTs in localStorage).

**Optional SSO.** Organisations may enable SAML / SSO via white-label configuration when provisioned. SSO complements (does not replace) MFA and organisation membership checks.

## 4. Multi-tenant Isolation

Customer workspaces are isolated using organisation identifiers and Postgres row-level security (RLS) on the shared data plane. Privileged server paths assert platform or organisation admin authorisation independently of the UI.

## 5. Optional Bring-Your-Own-Database (BYOD)

By default, portfolio and delivery data reside on the shared iProjectX data plane. Organisations may optionally activate a customer-hosted PostgREST-compatible database for **tenant business data** (projects, RAID, financials, timesheets, work items, and related registers).

When BYOD is active:

- **Control plane** (accounts, organisations, billing, branding, SSO config, BYOD connection secrets, support, legal, and security/audit events) remains on iProjectX.
- **Tenant business data** is served from the customer database via a same-origin authenticated proxy; customer service-role secrets never ship to the browser.
- Customers are responsible for applying the required schema migrations, backups, and availability of their database.

BYOD is off by default and requires platform-admin configuration, connection testing, and explicit activation.

## 6. Network and Application Security

We apply secure development practices, dependency management, and environment separation appropriate to our architecture. Application protections may include authentication checks, authorisation enforcement, input validation, CSP, HSTS, and rate limiting. Infrastructure is hosted with reputable cloud providers that maintain physical and environmental controls for their facilities.

## 7. Monitoring, Logging, and Detection

We monitor service health and security-relevant events (including login, logout, and failed authentication). Logs are retained for operational, security, and investigative purposes for limited periods. Anomalous activity may trigger investigation under our Incident Response Policy. Organisation administrators can export evidence packs for auditors where the product provides that capability.

## 8. Vulnerability Management

We track and remediate known vulnerabilities in platforms and dependencies based on severity and exploitability. Customers and researchers who discover a potential vulnerability should report it responsibly to security@iprojectx.com. Please do not publicly disclose before we have had a reasonable opportunity to investigate and remediate.

## 9. Backup and Resilience

We maintain backup and recovery processes intended to support continuity of the Services on the shared data plane. Recovery objectives may vary by component; enterprise customers may negotiate additional commitments in an order form or SLA addendum. When BYOD is active, Customer is responsible for backup and recovery of the customer-hosted database.

## 10. Personnel and Vendors

Personnel with production access receive security and privacy guidance relevant to their roles. Subprocessors are evaluated for security posture and bound by contractual confidentiality and data-protection terms. Material subprocessors can be requested from privacy@iprojectx.com or security@iprojectx.com. Customer-hosted BYOD databases are operated by Customer (or Customer’s chosen host), not as an iProjectX subprocessor for that data plane.

## 11. Security Status and Certifications

iProjectX designs controls for SOC 2 and ISO 27001 readiness. This policy describes control intent and current product capabilities; it does **not** claim that iProjectX holds a completed SOC 2 Type II or ISO 27001 certification unless separately confirmed in writing. Ask security@iprojectx.com for the latest assurance status.

## 12. Customer Shared Responsibility

Security is a shared model. Customers must manage user access, protect credentials, complete MFA enrollment, configure optional SSO correctly when used, configure permissions appropriately, and ensure Customer Content is lawfully collected and classified. See our Customer Responsibilities policy.

## 13. Contact

Security: security@iprojectx.com  
Privacy: privacy@iprojectx.com  
Support: support@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'information-security';

-- ──────────────────────────────────────────────────────────
-- customer-responsibilities
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
Using iProjectX effectively and safely is a shared responsibility. This policy outlines what Customer organisations and their users must do when using the Services.

## 1. Account Security

Customers must:

- Assign accounts only to authorised individuals
- Require strong, unique credentials and protect them from sharing
- Complete **mandatory TOTP authenticator MFA** enrollment for every user (MFA cannot be turned off in-product)
- Where optional **SSO** is enabled for the organisation, configure the identity provider correctly, keep domains and provider IDs accurate, and provision only authorised users
- Revoke access promptly when staff leave or change roles
- Notify security@iprojectx.com and support@iprojectx.com of suspected unauthorised access
- Avoid storing passwords in shared documents or chat channels

iProjectX is not responsible for losses arising from compromised Customer credentials, misconfigured SSO, or mismanaged user permissions.

## 2. Data Accuracy and Lawfulness

Customers are responsible for the accuracy, quality, and legality of Customer Content. You must ensure you have a lawful basis and any required notices or consents to upload personal data, and that content does not infringe third-party rights. iProjectX does not independently verify the correctness of project data, forecasts, or decisions recorded in the platform.

If you process special categories of personal data or highly regulated information, confirm that your plan and configuration are appropriate before doing so.

## 3. Optional Bring-Your-Own-Database (BYOD)

If Customer activates BYOD:

- Provide a PostgREST-compatible HTTPS database API and keep credentials current
- Apply the iProjectX schema migrations required for portfolio features before relying on those features
- Operate backups, monitoring, patching, and access control for the customer-hosted database
- Understand that Auth, billing, branding, SSO configuration, and BYOD secrets remain on the iProjectX control plane
- Accept that availability and performance of tenant data then depend on Customer’s database as well as the iProjectX application tier

## 4. Authorised Users and Administrators

Customer must designate administrators who correctly configure roles, billing contacts, and retention practices. Administrators act on behalf of Customer; instructions from administrators are treated as Customer instructions under our DPA.

Keep administrator contact details current so we can reach you during incidents or billing events.

## 5. Acceptable Use

Users must comply with the Acceptable Use Policy, Terms of Service, and applicable law. Customer is responsible for its users’ conduct, including contractors and temporary staff granted access.

## 6. Configuration and Backups of Customer-Managed Artefacts

Where the product allows exports or integrations, Customer should maintain appropriate internal records and export practices for business continuity. Relying solely on any single SaaS system without Customer-side continuity planning is at Customer’s risk, except as expressly covered by our SLA.

Test critical integrations after changes to identity providers, network rules, or API credentials — including after BYOD activation or credential rotation.

## 7. AI and Automated Outputs

If Customer enables AI features, Customer must ensure human review appropriate to the risk of the decision, and must not use outputs as the sole basis for significant legal, financial, safety, or employment decisions without independent verification. See AI Usage Disclosure. In-house AI is the default; any Approved Open AI model is available only when the organisation explicitly requests it.

## 8. Cooperation

Customers agree to provide timely information reasonably required to diagnose issues, fulfil data-protection requests directed to Customer, and investigate incidents. Delayed responses may extend resolution times outside SLA targets.

## 9. Contact

Support: support@iprojectx.com  
Security: security@iprojectx.com  
Privacy: privacy@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'customer-responsibilities';

-- ──────────────────────────────────────────────────────────
-- privacy-policy (add hosting / BYOD / MFA clarity)
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX ("we", "us", "our") is committed to protecting the personal information of individuals who use our project portfolio management platform and related services (the "Services"). This Privacy Policy explains what we collect, how we use and share it, how long we keep it, and the rights available to you under the Australian Privacy Act 1988 (Cth), the Australian Privacy Principles (APPs), and, where applicable, the EU General Data Protection Regulation (GDPR) and similar laws.

## 1. Scope

This policy applies to personal information processed when you visit our websites, create or use an iProjectX account, interact with support, or otherwise engage with the Services. It does not cover third-party sites or services that may link to or integrate with iProjectX.

## 2. Information We Collect

**Account and profile data.** Name, email address, organisation name, role or job title, authentication credentials (including MFA authenticator enrollment metadata), optional SSO identifiers where configured, and preferences you configure in the platform.

**Customer content.** Project data, documents, comments, decisions, forecasts, and other materials you or your authorised users upload or generate in the Services ("Customer Content"). We process Customer Content as a service provider / processor on behalf of your organisation. Where optional Bring-Your-Own-Database (BYOD) is active, tenant business Customer Content is stored in the customer-hosted database; account, billing, and control-plane data remain on iProjectX.

**Usage and technical data.** Feature usage, pages viewed, session duration, approximate location derived from IP address, browser type, device identifiers, and diagnostic or error logs needed to operate and secure the Services.

**Communications.** Messages you send to support, billing, privacy, or security contacts, and related metadata.

**Billing data.** Subscription plan, invoices, payment status, and limited payment method details processed by our payment providers (we do not store full card numbers).

## 3. How We Use Information

We use personal information to:

- Provide, maintain, authenticate (including MFA and optional SSO), and improve the Services
- Manage accounts, subscriptions, and billing
- Communicate about product updates, security notices, and support
- Monitor integrity, prevent abuse, and investigate security incidents
- Comply with legal obligations and enforce our agreements
- Analyse aggregated or de-identified usage to improve reliability and usability

We do not sell personal information.

## 4. Legal Bases (where GDPR applies)

Where GDPR or similar frameworks apply, we rely on: performance of a contract; legitimate interests (securing and improving the Services, in a manner that does not override your rights); consent where required (for example certain cookies or marketing); and legal obligation.

## 5. Sharing and Third Parties

We may share personal information with:

- **Infrastructure and subprocessors** that host, store, email, monitor, or process data under contractual confidentiality and security obligations
- **Payment processors** for subscription billing
- **Customer-hosted database providers** when the organisation enables BYOD (operated under Customer’s control for tenant business data)
- **Professional advisors** (legal, accounting) under confidentiality
- **Authorities** when required by law or to protect rights, safety, or security

A current list of material subprocessors is available on request from privacy@iprojectx.com.

## 6. International Transfers

iProjectX may process data in Australia and other jurisdictions where our providers operate. Where required, we use appropriate safeguards such as contractual clauses and vendor due diligence. For BYOD, transfer and hosting locations are determined by Customer’s chosen database host.

## 7. Retention

We retain account and billing records for as long as your organisation maintains an active subscription and for a reasonable period afterward for legal, accounting, and dispute-resolution purposes (typically up to seven years for financial records, unless a shorter or longer period is required by law). Customer Content is retained per your organisation’s configuration and our Data Retention Policy. See also our Data Retention Policy for deletion request handling. BYOD tenant data retention follows Customer’s database policies once that plane is active.

## 8. Security

We implement administrative, technical, and organisational measures appropriate to the risk, including encryption in transit, mandatory authenticator MFA, optional SSO, access controls, logging, and monitoring. No method of transmission or storage is perfectly secure; please also protect your credentials. See our Information Security Policy for more detail.

## 9. Your Rights

Subject to applicable law, you may request access, correction, deletion, restriction, portability, or objection to certain processing, and you may withdraw consent where processing is consent-based. Australian individuals may also complain to the Office of the Australian Information Commissioner (OAIC). EU/UK individuals may lodge a complaint with their supervisory authority.

To exercise rights, contact privacy@iprojectx.com. We may need to verify your identity and, for Customer Content held in an organisation workspace, may direct the request to your organisation’s administrator as the controller.

## 10. Children

The Services are intended for business use and are not directed to children under 16. We do not knowingly collect personal information from children.

## 11. Changes

We may update this policy from time to time. Material changes will be reflected by updating the policy on this page. Continued use of the Services after changes take effect constitutes acceptance where permitted by law.

## 12. Contact

Privacy enquiries: privacy@iprojectx.com  
General: hello@iprojectx.com  
Support: support@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'privacy-policy';

-- ──────────────────────────────────────────────────────────
-- data-processing-agreement
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Data Processing Agreement ("DPA") forms part of the agreement between iProjectX ("Processor", "we", "us") and the customer organisation using the Services ("Controller", "Customer") for processing of personal data in Customer Content. It applies where Customer is a controller (or equivalent) under the GDPR, UK GDPR, Australian Privacy Act, or similar laws, and iProjectX processes personal data on Customer’s behalf.

## 1. Roles

Customer determines the purposes and means of processing personal data within Customer Content. iProjectX processes such personal data only to provide the Services, per Customer’s documented instructions (including configuration and use of the platform), and as required by law. For account, billing, and product-improvement data about Customer’s users that iProjectX collects as an independent controller, our Privacy Policy applies separately.

## 2. Nature and Purpose of Processing

**Subject matter:** Hosting and operation of a project portfolio management SaaS platform.  
**Duration:** The subscription term plus any post-termination retention/export window.  
**Nature:** Storage, retrieval, transmission, display, backup, and deletion of Customer Content.  
**Purpose:** Providing, securing, supporting, and improving the Services as instructed.  
**Types of data:** As determined by Customer — commonly names, emails, roles, project records, comments, documents, and related business data.  
**Data subjects:** Customer’s personnel, contractors, and other individuals whose data Customer elects to process in the Services.  
**Hosting options:** By default, Customer Content is hosted on the iProjectX shared data plane. Where Customer activates optional BYOD, tenant business Customer Content is hosted in Customer’s database; iProjectX continues to process control-plane personal data and may transmit tenant queries to Customer’s API solely to deliver the Services.

## 3. Processor Obligations

iProjectX shall:

- Process personal data only on documented instructions from Customer, unless required by law (in which case we inform Customer unless legally prohibited)
- Ensure persons authorised to process personal data are bound by confidentiality
- Implement appropriate technical and organisational measures as described in our Information Security Policy (including mandatory TOTP MFA for users of the Services)
- Assist Customer, insofar as reasonably possible, with data subject requests, DPIAs, and consultations with supervisory authorities, at Customer’s reasonable expense if assistance is material
- Delete or return personal data after the Services end, at Customer’s choice, unless retention is required by law (for BYOD tenant data, deletion/return is performed in cooperation with Customer’s database controls)
- Make available information reasonably necessary to demonstrate compliance with this DPA

## 4. Subprocessors

Customer authorises iProjectX to engage subprocessors to deliver the Services. We impose data-protection obligations no less protective than those in this DPA. We remain responsible for subprocessors’ performance. On request to privacy@iprojectx.com, we will provide information about material subprocessors. If Customer reasonably objects to a new subprocessor on data-protection grounds, the parties will discuss alternatives in good faith, which may include termination rights for the affected Services.

Customer-hosted BYOD infrastructure is not an iProjectX subprocessor; Customer remains controller of that hosting arrangement.

## 5. International Transfers

Where personal data is transferred internationally, iProjectX will ensure an appropriate transfer mechanism is in place (such as standard contractual clauses or equivalent safeguards) where required by applicable law. BYOD hosting locations are selected by Customer.

## 6. Security Incidents

iProjectX will notify Customer without undue delay after becoming aware of a personal data breach affecting Customer Content under iProjectX control, and will provide information reasonably available to help Customer meet its own notification duties. See our Incident Response Policy for operational timelines. For BYOD tenant-plane incidents originating in Customer’s environment, Customer remains primarily responsible for detection and notification, with reasonable cooperation from iProjectX where the application tier is involved.

## 7. Audits

Upon reasonable written notice, and subject to confidentiality, iProjectX will provide security documentation or summaries reasonably sufficient to demonstrate compliance. On-site audits may be agreed where documentation is insufficient, limited to once per year (unless a material incident occurs), during business hours, and at Customer’s cost unless a material non-compliance is found.

## 8. Liability

Liability under this DPA is subject to the limitations in the Terms of Service, except where prohibited by applicable data-protection law.

## 9. Contact

Privacy / DPA: privacy@iprojectx.com  
Security: security@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'data-processing-agreement';

-- ──────────────────────────────────────────────────────────
-- pricing-plans (SSO / BYOD clarity)
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX offers subscription plans designed for teams of different sizes and governance needs. Exact feature packaging, user limits, and list prices are shown at checkout or in your order form; this page describes the tiers in general terms.

## 1. Plan Tiers

### Standard

Built for growing teams that need a structured project workspace. Typical inclusions:

- Core project and portfolio views
- Collaboration, comments, and document attachments within platform limits
- Standard reporting and dashboards
- Email support during business hours
- Security baselines described in our Information Security Policy (including mandatory authenticator MFA)

### Business

For organisations that need stronger governance, scale, and administrative control. Typical inclusions:

- Everything in Standard, plus advanced roles and permissions
- Expanded reporting, exports, and workflow configuration
- Higher storage and automation allowances
- Priority support response targets (see SLA)
- Optional integrations available on the plan

### Enterprise

For complex estates and regulated environments. Typical inclusions:

- Everything in Business, plus custom contractual terms where agreed
- Dedicated onboarding / success engagement (as scoped)
- Enhanced admin, audit, and security configuration options
- Optional per-organisation **SSO** (SAML) where provisioned
- Optional **Bring-Your-Own-Database (BYOD)** for tenant business data residency
- Service credits and uptime commitments per SLA / order form
- Named support escalation paths

Feature availability evolves; the authoritative list for your subscription is the plan matrix presented at purchase or in your enterprise agreement.

## 2. Billing Frequency

Plans are typically available on **monthly** or **annual** billing. Annual billing may include a discount relative to month-to-month pricing. Fees are charged in advance. Taxes may apply based on your location.

## 3. Upgrades and Downgrades

**Upgrades** to a higher tier can usually be applied immediately; we may prorate the difference for the remainder of the current term.  
**Downgrades** generally take effect at the next renewal so you retain paid features through the period already purchased. Some Enterprise features cannot move to lower tiers without a new agreement.

Changes can be requested in-product by an administrator or via billing@iprojectx.com.

## 4. Seats and Usage

Plans may be priced per organisation, per active user/seat, or a combination. Exceeding included limits may require purchasing additional seats or moving to a higher tier. Fair-use limits may apply to storage, API calls, and AI features.

## 5. Trials and Evaluations

Where a trial is offered, it is for evaluation only, time-limited, and may exclude certain Enterprise features (including SSO and BYOD). Trial terms are presented at signup.

## 6. Cancellations and Refunds

Cancellation and refund rules are set out in the Refund & Cancellation Policy.

## 7. Contact

Billing: billing@iprojectx.com  
Sales / general: hello@iprojectx.com  
Support: support@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'pricing-plans';
