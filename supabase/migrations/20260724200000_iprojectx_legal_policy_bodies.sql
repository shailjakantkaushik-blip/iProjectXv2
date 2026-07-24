-- Replace placeholder legal policy bodies with complete iProjectX policy text.
-- Bodies intentionally omit H1 titles and "Last updated" lines (shown by the UI).

-- ──────────────────────────────────────────────────────────
-- privacy-policy
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX ("we", "us", "our") is committed to protecting the personal information of individuals who use our project portfolio management platform and related services (the "Services"). This Privacy Policy explains what we collect, how we use and share it, how long we keep it, and the rights available to you under the Australian Privacy Act 1988 (Cth), the Australian Privacy Principles (APPs), and, where applicable, the EU General Data Protection Regulation (GDPR) and similar laws.

## 1. Scope

This policy applies to personal information processed when you visit our websites, create or use an iProjectX account, interact with support, or otherwise engage with the Services. It does not cover third-party sites or services that may link to or integrate with iProjectX.

## 2. Information We Collect

**Account and profile data.** Name, email address, organisation name, role or job title, authentication credentials, and preferences you configure in the platform.

**Customer content.** Project data, documents, comments, decisions, forecasts, and other materials you or your authorised users upload or generate in the Services ("Customer Content"). We process Customer Content as a service provider / processor on behalf of your organisation.

**Usage and technical data.** Feature usage, pages viewed, session duration, approximate location derived from IP address, browser type, device identifiers, and diagnostic or error logs needed to operate and secure the Services.

**Communications.** Messages you send to support, billing, privacy, or security contacts, and related metadata.

**Billing data.** Subscription plan, invoices, payment status, and limited payment method details processed by our payment providers (we do not store full card numbers).

## 3. How We Use Information

We use personal information to:

- Provide, maintain, authenticate, and improve the Services
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
- **Professional advisors** (legal, accounting) under confidentiality
- **Authorities** when required by law or to protect rights, safety, or security

A current list of material subprocessors is available on request from privacy@iprojectx.com.

## 6. International Transfers

iProjectX may process data in Australia and other jurisdictions where our providers operate. Where required, we use appropriate safeguards such as contractual clauses and vendor due diligence.

## 7. Retention

We retain account and billing records for as long as your organisation maintains an active subscription and for a reasonable period afterward for legal, accounting, and dispute-resolution purposes (typically up to seven years for financial records, unless a shorter or longer period is required by law). Customer Content is retained per your organisation’s configuration and our Data Retention Policy. See also our Data Retention Policy for deletion request handling.

## 8. Security

We implement administrative, technical, and organisational measures appropriate to the risk, including encryption in transit, access controls, logging, and monitoring. No method of transmission or storage is perfectly secure; please also protect your credentials. See our Information Security Policy for more detail.

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
-- terms-of-service
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
These Terms of Service ("Terms") govern access to and use of the iProjectX platform and related services (the "Services") provided by iProjectX ("iProjectX", "we", "us", "our"). By creating an account, inviting users, or using the Services, you agree to these Terms on behalf of yourself and, if applicable, the organisation you represent ("Customer").

## 1. Eligibility and Accounts

You must be legally able to enter a binding contract and authorised to bind your organisation if you accept these Terms for a business. You are responsible for the accuracy of registration information, safeguarding credentials, and all activity under your accounts. Notify support@iprojectx.com promptly of unauthorised access.

## 2. Licence to Use the Services

Subject to these Terms and timely payment of applicable fees, iProjectX grants Customer a limited, non-exclusive, non-transferable, non-sublicensable right to access and use the Services for Customer’s internal business purposes during the subscription term. We reserve all rights not expressly granted.

## 3. Customer Content and Intellectual Property

Customer retains ownership of data, documents, and materials submitted to the Services ("Customer Content"). Customer grants iProjectX a worldwide licence to host, process, transmit, and display Customer Content solely to provide and secure the Services and as otherwise directed by Customer.

iProjectX and its licensors own all right, title, and interest in the Services, software, documentation, branding, templates, and underlying technology, including improvements and aggregated insights that do not identify Customer or individuals. Feedback you provide may be used by iProjectX without restriction or obligation.

## 4. User Responsibilities

Customer and its users must:

- Use the Services only for lawful business purposes
- Comply with our Acceptable Use Policy and applicable laws
- Ensure only authorised personnel have access
- Maintain accurate account, billing, and user information
- Not misrepresent affiliation with iProjectX

Customer is responsible for configuring access permissions and for decisions made using outputs from the Services, including AI-assisted features.

## 5. Acceptable Use and Restrictions

You must not reverse engineer, scrape at abusive scale, interfere with security or availability, resell the Services without written consent, or use the Services to infringe others’ rights. Suspected violations may result in suspension. See the Acceptable Use Policy for detail.

## 6. Subscriptions, Fees, and Taxes

Paid plans are billed in advance according to the selected plan and billing frequency. Fees are non-refundable except as stated in our Refund & Cancellation Policy or required by law. Customer is responsible for applicable taxes. We may change pricing prospectively with notice; continued use after the effective date constitutes acceptance of the new pricing for subsequent terms.

## 7. Third-Party Services

The Services may integrate with third-party products. Those products are governed by their own terms. iProjectX is not responsible for third-party services outside our reasonable control.

## 8. Confidentiality

Each party will protect the other’s confidential information with reasonable care and use it only for performing under these Terms, except for information that is public, independently developed, or rightfully received from another source.

## 9. Suspension and Termination

Either party may terminate a subscription at the end of a billing period as described in the Refund & Cancellation Policy, or earlier for material breach if the breach remains uncured after 15 days’ written notice (or immediately for security/abuse risks). Upon termination, Customer’s right to access the Services ends. We will make Customer Content available for export for a reasonable period where feasible, after which we may delete it in accordance with our retention practices, unless legally required to retain it.

## 10. Warranties and Disclaimers

THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE". TO THE MAXIMUM EXTENT PERMITTED BY LAW, IPROJECTX DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not warrant uninterrupted or error-free operation, or that the Services will achieve particular business outcomes. Nothing in these Terms excludes rights that cannot be excluded under Australian Consumer Law.

## 11. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, IPROJECTX’S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THE SERVICES OR THESE TERMS SHALL NOT EXCEED THE FEES PAID BY CUSTOMER TO IPROJECTX FOR THE SERVICES IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM. IPROJECTX SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOST PROFITS, REVENUE, OR DATA, EVEN IF ADVISED OF THE POSSIBILITY. These limits do not apply to liability that cannot be limited by law.

## 12. Indemnity

Customer will defend and indemnify iProjectX against claims arising from Customer Content, Customer’s misuse of the Services, or Customer’s violation of law or these Terms.

## 13. Governing Law

These Terms are governed by the laws of New South Wales, Australia, without regard to conflict-of-law rules. Courts in New South Wales have exclusive jurisdiction, subject to mandatory consumer protections.

## 14. Changes

We may update these Terms by posting a revised version. Material changes affecting paid subscriptions will be notified with reasonable advance notice where practicable. Continued use after the effective date constitutes acceptance.

## 15. Contact

Support: support@iprojectx.com  
Billing: billing@iprojectx.com  
General: hello@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'terms-of-service';

-- ──────────────────────────────────────────────────────────
-- cookie-policy
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Cookie Policy explains how iProjectX ("we", "us", "our") uses cookies and similar technologies on our websites and within the iProjectX platform (the "Services"). It should be read together with our Privacy Policy.

## 1. What Are Cookies?

Cookies are small text files placed on your device when you visit a site or use an application. Similar technologies include local storage, session storage, and pixels. They help us operate the Services securely, remember preferences, and understand usage.

## 2. How We Use Cookies

We use cookies for:

- **Essential operation** — authentication, session management, security, load balancing, and fraud prevention
- **Preferences** — remembering UI settings such as theme, language, or layout choices
- **Analytics** — understanding feature adoption, performance, and reliability so we can improve the product
- **Communications** — where applicable, measuring engagement with product or marketing messages in a privacy-respecting manner

## 3. Categories of Cookies

| Category | Purpose | Typical duration | Consent |
|----------|---------|------------------|---------|
| Strictly necessary | Sign-in, security, CSRF protection, session continuity | Session to 12 months | Required for the Services to function |
| Functional / preferences | Remember settings and improve usability | Up to 12 months | May be required for certain features |
| Analytics | Aggregated usage and performance metrics | Up to 12 months | Where required by law, we seek consent |
| Marketing | Only if enabled for our public marketing sites | Up to 12 months | Consent-based where required |

## 4. Analytics

We may use first-party analytics and carefully selected third-party analytics providers to measure traffic and product usage. Where feasible, we configure analytics to minimise personal identifiers, IP truncation, or similar privacy controls. Analytics cookies help us diagnose errors, prioritise improvements, and maintain service quality.

## 5. Consent and Control

Where required by law, non-essential cookies are used only with your consent. You can manage cookie preferences through:

- Our cookie banner or preference controls (where available)
- Your browser settings to block or delete cookies
- Opt-out mechanisms provided by analytics vendors where applicable

If you disable essential cookies, parts of the Services (including sign-in) may not work. Blocking analytics cookies will not generally prevent core product use.

## 6. Third-Party Cookies

Some cookies may be set by subprocessors that help us host, secure, or analyse the Services. Those parties process data under their own policies and our contractual instructions. For questions about specific vendors, contact privacy@iprojectx.com.

## 7. Retention of Cookie Data

Cookie lifetimes vary by purpose as noted above. Analytics datasets derived from cookies are retained only as long as needed for reporting and improvement, then aggregated, anonymised, or deleted according to our retention practices.

## 8. Updates

We may update this Cookie Policy to reflect changes in technology, providers, or law. The current version will always be available on this page.

## 9. Contact

Privacy: privacy@iprojectx.com  
Support: support@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'cookie-policy';

-- ──────────────────────────────────────────────────────────
-- acceptable-use
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Acceptable Use Policy ("AUP") sets rules for using the iProjectX platform and related services (the "Services"). It supplements our Terms of Service. Violations may result in warning, suspension, termination, or referral to authorities.

## 1. Purpose

iProjectX provides a professional environment for project, portfolio, and delivery management. Users must act responsibly, respect others’ rights, and protect the security and integrity of the Services and Customer Content.

## 2. Prohibited Activities

You may not use the Services to:

- Violate any applicable law, regulation, or third-party right
- Upload, store, or distribute malware, ransomware, or other harmful code
- Attempt unauthorised access to accounts, systems, networks, or data
- Probe, scan, or test vulnerabilities except with prior written authorisation from iProjectX
- Interfere with, disrupt, or degrade the Services, including denial-of-service attacks or abusive automation
- Bypass authentication, rate limits, access controls, or security features
- Phish, spam, or send unsolicited bulk communications through or using the Services
- Impersonate any person or entity, or misrepresent affiliation with iProjectX
- Harvest personal information without a lawful basis and appropriate notices
- Host or share content that is illegal, defamatory, fraudulent, or that exploits minors
- Use the Services to facilitate money laundering, sanctions evasion, or other financial crime
- Resell, sublicense, or provide the Services to third parties except as expressly permitted in a written agreement
- Scrape or extract data at a volume or manner that impairs the Services or violates these Terms
- Use AI features to generate content intended to deceive in regulated contexts without appropriate human review and disclosure

## 3. Security Violations

Security-related misuse is treated as a material breach. This includes sharing credentials, attempting privilege escalation, exploiting bugs without responsible disclosure, or introducing backdoors into Customer Content workflows. Suspected security issues should be reported promptly to security@iprojectx.com rather than exploited.

## 4. Customer Content Standards

Customer and its users remain responsible for Customer Content. Do not upload content you lack rights to process, or content that creates undue legal or security risk for iProjectX or other customers. Organisations must ensure users are authorised and appropriately trained.

## 5. Resource Fairness

Accounts must not consume disproportionate compute, storage, API, or support resources in a way that harms other customers. We may throttle, queue, or require plan upgrades where usage is abusive or outside fair use for the subscribed tier.

## 6. Monitoring and Enforcement

We may investigate suspected AUP violations, review logs, and take action including removing content, suspending users, or terminating subscriptions. Where lawful and appropriate, we cooperate with law enforcement. Enforcement actions do not waive our other rights under the Terms.

## 7. Reporting Abuse

Report abuse, suspicious activity, or AUP violations to:

- Security incidents: security@iprojectx.com  
- General abuse / support: support@iprojectx.com  
- Privacy concerns: privacy@iprojectx.com  

Include relevant URLs, user identifiers, timestamps, and a description of the issue. We aim to acknowledge credible reports promptly and escalate based on severity.

## 8. Updates

iProjectX may update this AUP as threats and product capabilities evolve. Continued use of the Services after updates constitutes acceptance.
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'acceptable-use';

-- ──────────────────────────────────────────────────────────
-- refund-cancellation
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Refund & Cancellation Policy explains how iProjectX handles subscription cancellations, refund eligibility, and billing disputes for paid plans of the iProjectX platform (the "Services"). It forms part of our Terms of Service.

## 1. Subscription Terms

Paid subscriptions renew automatically at the end of each billing period (monthly or annual, depending on your plan) unless cancelled before renewal. Fees are generally charged in advance. Plan features and pricing are described on our Pricing & Plans page and in your order or invoice.

## 2. How to Cancel

Account administrators can cancel through billing settings in the platform, or by emailing billing@iprojectx.com from an authorised account email. Cancellation takes effect at the end of the current paid term unless otherwise agreed in writing. You retain access to paid features until that date.

Downgrades to a lower plan typically take effect at the next renewal unless we agree to an earlier change. Upgrades may be prorated for the remainder of the term.

## 3. Refund Eligibility

**Generally.** Fees already paid are non-refundable and non-creditable, except as required by law (including non-excludable Australian Consumer Law rights) or as expressly stated below.

**Cooling-off / first-term consideration.** For new self-serve subscriptions, if you cancel within fourteen (14) days of the initial purchase and have not made material productive use of the Services beyond reasonable evaluation, you may request a refund by contacting billing@iprojectx.com. We may decline refunds where usage indicates more than evaluation (for example extensive data import, multi-user rollout, or sustained operational use).

**Service failure.** If we fail to provide the Services in a manner that constitutes a major failure under applicable consumer law, or if we permanently discontinue the Services without a reasonable alternative, you may be entitled to a refund or credit for unused prepaid periods.

**Annual plans.** Mid-term cancellations of annual plans do not ordinarily entitle you to a pro-rata refund of unused months, except where required by law or expressly offered in writing.

Enterprise or custom contracts may specify different cancellation and refund terms that prevail over this policy to the extent of conflict.

## 4. Chargebacks and Billing Disputes

Please contact billing@iprojectx.com before initiating a card chargeback so we can investigate quickly. Provide invoice number, date, amount, and a description of the issue. We aim to acknowledge billing disputes within two (2) business days and resolve straightforward cases within ten (10) business days.

Unauthorised chargebacks may result in suspension until the matter is resolved. If a chargeback is filed in error and later reversed, access may be restored once payment is confirmed.

## 5. Taxes and Currency

Refunds, where granted, are issued to the original payment method in the currency charged, less any non-recoverable payment-processor fees where permitted by law. Tax treatment follows applicable rules and your invoice.

## 6. Data After Cancellation

After cancellation and expiry of the paid term, access may be limited or removed. We provide a reasonable window to export Customer Content where feasible. Thereafter data is handled under our Data Retention Policy. Cancellation does not relieve you of fees owed for the current term.

## 7. Contact

Billing: billing@iprojectx.com  
Support: support@iprojectx.com  
Complaints: complaints@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'refund-cancellation';

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
- Secrets such as API keys and credentials are stored using secure secret-management practices and are not committed to source control.

## 3. Access Controls

Access to production systems follows least privilege and need-to-know principles. Administrative access is authenticated, logged, and limited to authorised personnel. Customer organisations control end-user roles and permissions within their workspaces. We encourage strong passwords and support modern authentication practices offered by the platform.

## 4. Network and Application Security

We apply secure development practices, dependency management, and environment separation appropriate to our architecture. Application protections may include authentication checks, authorisation enforcement, input validation, and rate limiting. Infrastructure is hosted with reputable cloud providers that maintain physical and environmental controls for their facilities.

## 5. Monitoring, Logging, and Detection

We monitor service health and security-relevant events. Logs are retained for operational, security, and investigative purposes for limited periods. Anomalous activity may trigger investigation under our Incident Response Policy.

## 6. Vulnerability Management

We track and remediate known vulnerabilities in platforms and dependencies based on severity and exploitability. Customers and researchers who discover a potential vulnerability should report it responsibly to security@iprojectx.com. Please do not publicly disclose before we have had a reasonable opportunity to investigate and remediate.

## 7. Backup and Resilience

We maintain backup and recovery processes intended to support continuity of the Services. Recovery objectives may vary by component; enterprise customers may negotiate additional commitments in an order form or SLA addendum.

## 8. Personnel and Vendors

Personnel with production access receive security and privacy guidance relevant to their roles. Subprocessors are evaluated for security posture and bound by contractual confidentiality and data-protection terms. Material subprocessors can be requested from privacy@iprojectx.com or security@iprojectx.com.

## 9. Customer Shared Responsibility

Security is a shared model. Customers must manage user access, protect credentials, configure permissions appropriately, and ensure Customer Content is lawfully collected and classified. See our Customer Responsibilities policy.

## 10. Contact

Security: security@iprojectx.com  
Privacy: privacy@iprojectx.com  
Support: support@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'information-security';

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

## 3. Processor Obligations

iProjectX shall:

- Process personal data only on documented instructions from Customer, unless required by law (in which case we inform Customer unless legally prohibited)
- Ensure persons authorised to process personal data are bound by confidentiality
- Implement appropriate technical and organisational measures as described in our Information Security Policy
- Assist Customer, insofar as reasonably possible, with data subject requests, DPIAs, and consultations with supervisory authorities, at Customer’s reasonable expense if assistance is material
- Delete or return personal data after the Services end, at Customer’s choice, unless retention is required by law
- Make available information reasonably necessary to demonstrate compliance with this DPA

## 4. Subprocessors

Customer authorises iProjectX to engage subprocessors to deliver the Services. We impose data-protection obligations no less protective than those in this DPA. We remain responsible for subprocessors’ performance. On request to privacy@iprojectx.com, we will provide information about material subprocessors. If Customer reasonably objects to a new subprocessor on data-protection grounds, the parties will discuss alternatives in good faith, which may include termination rights for the affected Services.

## 5. International Transfers

Where personal data is transferred internationally, iProjectX will ensure an appropriate transfer mechanism is in place (such as standard contractual clauses or equivalent safeguards) where required by applicable law.

## 6. Security Incidents

iProjectX will notify Customer without undue delay after becoming aware of a personal data breach affecting Customer Content, and will provide information reasonably available to help Customer meet its own notification duties. See our Incident Response Policy for operational timelines.

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
-- data-retention
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Data Retention Policy describes how long iProjectX retains information associated with the Services and how deletion requests are handled. It complements our Privacy Policy and Data Processing Agreement.

## 1. Principles

We retain information only as long as needed to provide the Services, meet legal and accounting obligations, resolve disputes, and enforce agreements. Retention periods vary by data category and Customer configuration.

## 2. Customer Content

Customer Content (projects, documents, comments, and similar workspace data) is retained for the life of the Customer’s active subscription and any agreed export window after termination or downgrade. Customers control day-to-day deletion of records within the product according to their permissions.

After subscription end, we typically retain Customer Content for a limited period (commonly up to thirty (30) days) to allow export, unless a longer hold is required for a legal dispute or expressly agreed. Thereafter, Customer Content is deleted or anonymised from active systems within a commercially reasonable period, subject to backup rotation cycles.

## 3. Account and Profile Data

User account profiles, authentication records, and organisation membership metadata are retained while the account or organisation remains active. After account closure, we retain limited records as needed for security, fraud prevention, and legal compliance.

## 4. Billing and Financial Records

Invoices, payment confirmations, and subscription history are generally retained for up to seven (7) years (or longer if required by tax or corporate law).

## 5. Support and Communications

Support tickets and related correspondence are retained for a period sufficient to maintain service history and quality (typically up to three (3) years), unless a longer period is needed for an ongoing matter.

## 6. Logs and Security Telemetry

Operational and security logs are retained for shorter periods appropriate to troubleshooting and threat detection (often 30–180 days depending on log type), unless needed longer for an investigation.

## 7. Analytics

Aggregated or de-identified analytics may be retained longer because they do not identify individuals. Raw analytics identifiers are retained only as needed for product improvement.

## 8. Deletion Requests

**End users.** Individuals may request deletion under applicable privacy law by contacting privacy@iprojectx.com. Where iProjectX acts as processor, we will direct the request to the Customer organisation (controller) or act on Customer instructions.

**Customer administrators.** Organisation admins may delete workspace data within product capabilities or request account closure via support@iprojectx.com or billing@iprojectx.com.

We may retain information where necessary to comply with law, resolve disputes, prevent fraud, or enforce agreements. Backup media are overwritten on a rolling schedule; residual copies may persist until those cycles complete.

## 9. Contact

Privacy: privacy@iprojectx.com  
Support: support@iprojectx.com  
Security: security@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'data-retention';

-- ──────────────────────────────────────────────────────────
-- incident-response
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Incident Response Policy outlines how iProjectX prepares for, detects, responds to, and communicates about security incidents affecting the Services or Customer Content.

## 1. Definitions

A **security incident** is a suspected or confirmed event that threatens the confidentiality, integrity, or availability of the Services or Customer Content. A **personal data breach** is a security incident leading to accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data.

## 2. Preparation

We maintain runbooks, escalation paths, and contact channels for security events. Personnel with operational duties are instructed to escalate suspected incidents promptly. Customers should report suspected incidents to security@iprojectx.com (and support@iprojectx.com if account access is affected).

## 3. Detection and Triage

Alerts from monitoring, customer reports, vendor notices, and internal discovery are triaged by severity (for example: critical, high, medium, low) based on impact, exploitability, and data sensitivity. False positives are closed with documentation; confirmed issues enter containment.

## 4. Containment, Eradication, and Recovery

Depending on the incident, we may revoke credentials, isolate systems, apply patches, rotate secrets, restore from known-good backups, and increase monitoring. We prioritise stopping ongoing harm while preserving forensic evidence where practical.

## 5. Customer Notification Timelines

Where a personal data breach affecting Customer Content is confirmed, iProjectX will notify the affected Customer **without undue delay**, and in any event within **seventy-two (72) hours** of confirming the breach, where feasible and unless a longer or shorter period is required or permitted by law or a written customer agreement.

Notifications will include, where known at the time:

- Nature of the incident and approximate timeline
- Categories of data and data subjects potentially affected (high level)
- Likely consequences
- Measures taken or proposed to address the incident
- A point of contact for follow-up

We may provide updates as investigation progresses. Notification to individuals or regulators remains Customer’s responsibility as controller, except where law requires iProjectX to notify directly.

For significant availability incidents, we communicate via status updates and, where appropriate, email to administrators. See System Status.

## 6. Post-Incident Review

Material incidents undergo a post-incident review to identify root causes and improvement actions. Lessons learned may drive control enhancements, training, or vendor follow-up.

## 7. Customer Cooperation

Customers agree to reasonably cooperate with investigations, preserve relevant evidence under their control, and promptly secure compromised end-user accounts. Do not publicly disclose confidential forensic details that could increase risk without coordination.

## 8. Contact

Security (24×7 escalation intent for critical issues): security@iprojectx.com  
Support: support@iprojectx.com  
Privacy: privacy@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'incident-response';

-- ──────────────────────────────────────────────────────────
-- about
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX builds software that helps organisations plan, govern, and deliver complex projects with clarity. We combine portfolio visibility, structured workflows, and practical AI assistance so teams can make better decisions without drowning in spreadsheets and status noise.

## Mission

Our mission is to give project leaders and delivery teams a single, trustworthy operating system for work that matters — from initiation and funding through execution, risk, and outcomes — with security and accountability built in. We believe delivery excellence comes from shared truth: clear ownership, timely decisions, and data that leaders can trust.

## What We Offer

iProjectX provides cloud-hosted capabilities for project and portfolio management, including planning structures, collaboration, reporting, governance artefacts, and integrations that fit modern delivery organisations. We serve teams that need professionalism and auditability, not just task lists.

Typical use cases include capital and transformation programmes, operational improvement portfolios, stage-gate governance, and cross-functional status reporting for executives and delivery leads.

## How We Work

We design for clarity, reliability, and respectful handling of customer data. Product decisions favour durable workflows over novelty for its own sake. Security, privacy, and support commitments are documented in our public policies so customers know what to expect before they buy and while they operate.

We partner with customers through onboarding guidance, responsive support, and continuous product improvement informed by real delivery practice. Feedback from practitioners shapes our roadmap; we prioritise features that reduce ambiguity and administrative burden.

## Values

- **Clarity** — interfaces and workflows that make status and ownership obvious  
- **Accountability** — records that support audit, assurance, and decision traceability  
- **Respect for data** — privacy and security treated as product requirements, not afterthoughts  
- **Practical AI** — assistance that accelerates work while keeping humans in control  

## Contact

We welcome partnership and product conversations.

- General enquiries: hello@iprojectx.com  
- Customer support: support@iprojectx.com  
- Privacy: privacy@iprojectx.com  
- Security: security@iprojectx.com  
- Billing: billing@iprojectx.com  
- Complaints: complaints@iprojectx.com  

## Company

iProjectX operates as a technology service provider focused on project portfolio management software. For contractual notices, use the contacts above or the addresses specified in your order form or enterprise agreement. Related legal and operational documents — including Terms of Service, Privacy Policy, SLA, and Support & Help — are published alongside this page.

Thank you for trusting iProjectX with your delivery work.
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'about';

-- ──────────────────────────────────────────────────────────
-- pricing-plans
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
- Security baselines described in our Information Security Policy

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
- Custom SSO or identity integrations where available
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

Where a trial is offered, it is for evaluation only, time-limited, and may exclude certain Enterprise features. Trial terms are presented at signup.

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

-- ──────────────────────────────────────────────────────────
-- sla
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Service Level Agreement ("SLA") describes availability and support response commitments for paid iProjectX subscriptions. Enterprise agreements may supersede parts of this SLA where expressly stated.

## 1. Uptime Commitment

iProjectX targets **99.5% monthly uptime** for the production web application, measured as:

Monthly Uptime % = (Total Minutes in Month − Downtime Minutes) / Total Minutes in Month × 100

**Downtime** means the Services are unavailable to all or substantially all of Customer’s authorised users, excluding:

- Scheduled maintenance announced in advance
- Emergency maintenance required for security or stability
- Failures of Customer’s internet, devices, or identity providers
- Force majeure events and third-party upstream outages outside our reasonable control
- Beta, trial, or non-production environments
- Suspension due to Customer breach, non-payment, or AUP violations

## 2. Scheduled Maintenance

We aim to schedule maintenance during low-usage windows and to provide at least forty-eight (48) hours’ notice for planned downtime expected to exceed fifteen (15) minutes, via status page, in-app notice, or email to administrators where practicable.

## 3. Support Response Times

Support is available at support@iprojectx.com. Target first-response times during iProjectX business hours (Australian business days, unless otherwise agreed):

| Severity | Description | Standard | Business | Enterprise |
|----------|-------------|----------|----------|------------|
| P1 — Critical | Production down or severe security incident affecting all users | 8 business hours | 4 business hours | 2 business hours |
| P2 — High | Major feature impaired; workaround limited | 1 business day | 8 business hours | 4 business hours |
| P3 — Normal | Partial impairment or general how-to | 2 business days | 1 business day | 8 business hours |
| P4 — Low | Enhancement questions, minor issues | 3 business days | 2 business days | 1 business day |

These are response targets, not fix guarantees. Resolution time depends on complexity and Customer cooperation.

## 4. Service Credits

If Monthly Uptime falls below 99.5% for a calendar month, Customer may request a service credit against future subscription fees:

| Monthly Uptime | Credit |
|----------------|--------|
| < 99.5% and ≥ 99.0% | 5% of that month’s fees |
| < 99.0% and ≥ 98.0% | 10% of that month’s fees |
| < 98.0% | 15% of that month’s fees |

Credits are Customer’s sole remedy for downtime under this SLA unless an enterprise contract states otherwise. Credits are not cash refunds, do not roll beyond the subsequent invoice unless agreed, and exclude taxes and one-time fees.

## 5. Credit Requests

Email billing@iprojectx.com within thirty (30) days after the affected month with organisation name, dates, and a brief description. We will validate against our monitoring records.

## 6. Contact

Support: support@iprojectx.com  
Billing: billing@iprojectx.com  
Security emergencies: security@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'sla';

-- ──────────────────────────────────────────────────────────
-- support-help
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX support helps customers use the platform effectively, resolve technical issues, and escalate billing or security matters to the right team.

## 1. How to Get Help

- **Email:** support@iprojectx.com (primary channel for most requests)
- **Billing:** billing@iprojectx.com
- **Security:** security@iprojectx.com
- **Privacy:** privacy@iprojectx.com
- **General / partnerships:** hello@iprojectx.com

When contacting support, include your organisation name, affected users, environment (browser), steps to reproduce, and screenshots or error messages where relevant. Clear context shortens time to first meaningful response.

## 2. Hours and Response Targets

Support operates on Australian business days unless your Enterprise agreement specifies extended coverage. Response targets by plan are described in our SLA. Critical outages should be marked as urgent in your subject line and, for security incidents, also sent to security@iprojectx.com.

We may ask follow-up questions to reproduce an issue. Timely replies from your side help us meet response and resolution goals.

## 3. Brief FAQs

**How do I reset my password?** Use the sign-in “forgot password” flow. If you use SSO, contact your organisation’s identity administrator.

**Who can change billing or cancel?** Organisation administrators or billing contacts on file. See Refund & Cancellation Policy.

**How do I export data?** Administrators can use in-product export features where available, or request assistance via support for end-of-subscription exports.

**Do you offer training?** Business and Enterprise plans may include onboarding guidance; ask hello@iprojectx.com or your success contact.

**Where is system status?** See our System Status policy for how we publish incidents and maintenance.

**How is AI used?** See AI Usage Disclosure — outputs may require human review.

**Can you change data on our behalf?** We generally do not modify Customer Content without authorised administrator instruction, except as needed to restore service or address a confirmed security issue.

**How do I add or remove users?** Organisation administrators manage seats and roles in admin settings. Seat limits follow your plan; contact billing@iprojectx.com for expansions.

## 4. What Support Covers

We assist with product defects, availability issues, account access problems, and guidance on documented features. We do not provide unlimited custom consulting, legal advice, or configuration of unrelated third-party systems unless agreed in a statement of work.

Priority is given to P1/P2 issues affecting production access. Enhancement requests are logged as product feedback and are not subject to SLA fix timelines.

## 5. Escalations and Complaints

If you are unsatisfied with a support outcome, escalate to complaints@iprojectx.com with your original ticket reference. See Contact & Complaints for acknowledgement and resolution timeframes.

## 6. Updates

Help resources and channels may evolve; this page reflects current practice. For plan-specific entitlements, refer to Pricing & Plans and your order form.
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'support-help';

-- ──────────────────────────────────────────────────────────
-- system-status
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX communicates the operational health of the Services so customers can plan work and understand incidents.

## 1. Status Updates

We publish service status information through our status channel (status page and/or in-app notices). Administrators may also receive email for material incidents affecting availability or security. For the latest operational view, check the status page linked from the product or marketing site when available, or contact support@iprojectx.com.

Status messaging is intended to be factual and timely. During fast-moving incidents, early updates may be brief and refined as we learn more.

## 2. What We Report

Status communications typically cover:

- **Operational** — no known platform-wide issues
- **Degraded performance** — elevated errors or latency
- **Partial outage** — subset of features or regions affected
- **Major outage** — primary application unavailable
- **Maintenance** — planned work windows

Component-level notes (authentication, API, file storage, AI features, etc.) may be included when useful. Not every minor bug is elevated to a status event; issues limited to a single organisation are usually handled via support tickets.

## 3. Maintenance

Scheduled maintenance is announced in advance when downtime is expected to be material — typically at least forty-eight (48) hours ahead for windows expected to exceed fifteen (15) minutes, where practicable. Emergency maintenance may occur with little notice when required to protect security or data integrity. We minimise duration and impact wherever practical and prefer rolling or low-disruption deployments when feasible.

## 4. Incident History

After significant incidents, we may post a summary of impact and resolution on the status page. Detailed forensic information is shared with affected customers through private channels when appropriate. Historical status entries help customers understand past reliability; they are not a warranty of future performance. Formal availability commitments and credits are governed by the SLA.

Customers who believe an outage qualifies for a service credit should follow the credit-request process in the SLA rather than relying solely on status-page text.

## 5. Customer Actions During Incidents

- Check the status page before opening duplicate tickets
- Preserve error messages and timestamps
- Ensure local network and SSO providers are healthy
- For suspected account compromise, contact security@iprojectx.com immediately
- Designate an internal contact who can approve urgent configuration changes if requested

## 6. Relationship to Other Policies

System Status describes communication practices. The SLA defines measurable uptime and credits. The Incident Response Policy covers security breach handling and customer notification timelines for personal data incidents.

## 7. Contact

Support: support@iprojectx.com  
Security: security@iprojectx.com  
Billing (credits): billing@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'system-status';

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
- Revoke access promptly when staff leave or change roles
- Enable available security features (such as SSO or MFA where offered)
- Notify security@iprojectx.com and support@iprojectx.com of suspected unauthorised access
- Avoid storing passwords in shared documents or chat channels

iProjectX is not responsible for losses arising from compromised Customer credentials or mismanaged user permissions.

## 2. Data Accuracy and Lawfulness

Customers are responsible for the accuracy, quality, and legality of Customer Content. You must ensure you have a lawful basis and any required notices or consents to upload personal data, and that content does not infringe third-party rights. iProjectX does not independently verify the correctness of project data, forecasts, or decisions recorded in the platform.

If you process special categories of personal data or highly regulated information, confirm that your plan and configuration are appropriate before doing so.

## 3. Authorised Users and Administrators

Customer must designate administrators who correctly configure roles, billing contacts, and retention practices. Administrators act on behalf of Customer; instructions from administrators are treated as Customer instructions under our DPA.

Keep administrator contact details current so we can reach you during incidents or billing events.

## 4. Acceptable Use

Users must comply with the Acceptable Use Policy, Terms of Service, and applicable law. Customer is responsible for its users’ conduct, including contractors and temporary staff granted access.

## 5. Configuration and Backups of Customer-Managed Artefacts

Where the product allows exports or integrations, Customer should maintain appropriate internal records and export practices for business continuity. Relying solely on any single SaaS system without Customer-side continuity planning is at Customer’s risk, except as expressly covered by our SLA.

Test critical integrations after changes to identity providers, network rules, or API credentials.

## 6. AI and Automated Outputs

If Customer enables AI features, Customer must ensure human review appropriate to the risk of the decision, and must not use outputs as the sole basis for significant legal, financial, safety, or employment decisions without independent verification. See AI Usage Disclosure.

## 7. Cooperation

Customers agree to provide timely information reasonably required to diagnose issues, fulfil data-protection requests directed to Customer, and investigate incidents. Delayed responses may extend resolution times outside SLA targets.

## 8. Contact

Support: support@iprojectx.com  
Security: security@iprojectx.com  
Privacy: privacy@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'customer-responsibilities';

-- ──────────────────────────────────────────────────────────
-- ai-usage-disclosure
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX may offer artificial intelligence (AI) and machine-learning features that assist with drafting, summarising, classifying, suggesting, or analysing content within the platform. This disclosure explains how those features work at a high level and their limitations.

## 1. How AI Outputs Are Created

AI features may send relevant prompts, selected Customer Content, and contextual metadata to models operated by iProjectX and/or approved subprocessors to generate suggestions or transformed text. Processing is performed to provide the feature you invoke, to maintain safety filters, and to improve reliability of the feature under our privacy and security commitments.

We design AI features to operate within your authenticated workspace context. We do not sell your prompts or Customer Content to train third-party foundation models for unrelated public use. Where a vendor’s terms require specific handling, we bind them contractually as subprocessors.

Some features may use retrieval over your workspace content so answers stay grounded in your projects; grounding reduces but does not eliminate error.

## 2. Accuracy Limits

AI outputs can be incomplete, outdated, biased, or incorrect. They may omit critical risks, invent plausible-sounding details, or misread source material. **AI outputs are assistive only** and are not a substitute for professional judgement, qualified advice, or your organisation’s governance processes.

You should independently verify facts, figures, legal or compliance interpretations, schedules, cost estimates, and recommendations before relying on them for decisions. Confidence language in an output does not mean the content is verified.

## 3. Human Review

Customer must ensure an appropriately skilled human reviews AI-assisted content before it is used for external communications, regulatory submissions, financial approvals, safety-critical decisions, or employment-related actions. Administrators should set internal policies for when AI may be used and how review is evidenced.

## 4. Customer Responsibilities for Inputs

Do not submit secrets, unnecessary sensitive personal data, or content you lack rights to process into AI features. Customer remains controller of personal data included in prompts and source documents. Users should minimise personal data in prompts where possible.

## 5. Availability and Changes

AI features may be limited by plan, region, or capacity. We may modify, throttle, or discontinue AI functionality as models, regulations, and safety requirements evolve. Beta AI features may be less reliable and are provided without SLA uptime credits unless expressly stated.

## 6. Intellectual Property

Subject to the Terms of Service, Customer retains rights in Customer Content. Ownership of model outputs may depend on applicable law and vendor terms; regardless, Customer is responsible for ensuring its use of outputs does not infringe others’ rights.

## 7. Transparency to End Users

Where your organisation redistributes AI-assisted content externally, you are responsible for any disclosures required by law or your own policies.

## 8. Contact

Questions: support@iprojectx.com  
Privacy: privacy@iprojectx.com  
Security: security@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'ai-usage-disclosure';

-- ──────────────────────────────────────────────────────────
-- disclaimer
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
This Disclaimer applies to the iProjectX websites, documentation, and Services. It should be read with our Terms of Service.

## 1. No Guarantee of Business Outcomes

iProjectX provides software tools to support project and portfolio management. We do not guarantee that use of the Services will achieve any particular business result, including on-time delivery, cost savings, regulatory approval, funding outcomes, profit, or risk reduction. Project success depends on Customer’s people, processes, data quality, and external factors outside our control.

Forecasts, dashboards, risk scores, and similar views reflect the data and assumptions you provide. They are decision-support aids, not assurances of future performance.

## 2. Informational Content

Blog posts, guides, templates, examples, and AI-generated suggestions are for general informational purposes. They are not legal, financial, engineering, or professional advice. You should obtain advice from qualified professionals for your circumstances.

Training materials and sample configurations may not match your organisation’s policies or regulatory environment. Adapt them carefully before operational use.

## 3. Availability and Accuracy

While we strive for reliable service and accurate documentation, content and features may contain errors or become outdated. Temporary interruptions may occur. Formal availability commitments are limited to those in the SLA for eligible paid plans.

Screenshots and marketing descriptions may lag behind the live product. Where documentation conflicts with the in-product experience, the live Services and your order form prevail for feature entitlement questions.

## 4. Third-Party Materials

Links to third-party sites or integrations are provided for convenience. iProjectX does not control and is not responsible for third-party content, policies, or performance. Use of third-party services is at your own risk and subject to those providers’ terms.

## 5. Limitation of Liability

To the maximum extent permitted by law, iProjectX excludes liability for indirect, incidental, special, consequential, or punitive damages, and for lost profits, revenue, goodwill, or data, arising from use of or reliance on the Services or site content. Our aggregate liability is limited as set out in the Terms of Service (generally, fees paid in the twelve months preceding the claim). Nothing in this Disclaimer excludes liability that cannot be excluded under Australian Consumer Law or other mandatory rules.

## 6. Forward-Looking Statements

Statements about planned features, roadmaps, or future capabilities are aspirational and may change. They do not create contractual obligations unless expressly incorporated into a signed order form.

## 7. Acceptance

By using the Services or site, you acknowledge this Disclaimer. If you do not agree, do not use the Services.

## 8. Contact

General: hello@iprojectx.com  
Support: support@iprojectx.com  
Legal / complaints: complaints@iprojectx.com
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'disclaimer';
-- ──────────────────────────────────────────────────────────
-- contact-complaints
-- ──────────────────────────────────────────────────────────
UPDATE public.legal_policies
SET body_markdown = $md$
iProjectX welcomes feedback and takes complaints seriously. This page explains how to contact us and how we handle formal complaints.

## 1. Primary Contacts

| Topic | Email |
|-------|-------|
| Customer support | support@iprojectx.com |
| General enquiries | hello@iprojectx.com |
| Billing | billing@iprojectx.com |
| Privacy | privacy@iprojectx.com |
| Security | security@iprojectx.com |
| Formal complaints | complaints@iprojectx.com |

## 2. Before Filing a Complaint

Many issues resolve faster through ordinary support. Please contact support@iprojectx.com first for product defects, access problems, or how-to questions, and billing@iprojectx.com for invoice concerns. If you remain unsatisfied after a reasonable attempt, escalate to complaints@iprojectx.com.

## 3. How to Submit a Complaint

Email complaints@iprojectx.com with:

- Your name, organisation, and account email
- A clear description of the issue and desired resolution
- Relevant dates, ticket numbers, invoices, or screenshots
- Whether the matter involves privacy, security, billing, or service quality

## 4. Acknowledgement and Resolution Timeframes

- **Acknowledgement:** We aim to acknowledge formal complaints within **two (2) business days**.
- **Investigation:** We investigate in good faith, which may include reviewing logs, speaking with support staff, and contacting you for clarification.
- **Substantive response:** We aim to provide a substantive response within **fifteen (15) business days** of acknowledgement for standard matters. Complex issues (for example multi-party security or legal questions) may take longer; we will notify you of revised timelines.
- **Privacy complaints:** Privacy-related complaints may also be sent to privacy@iprojectx.com; we handle them under our Privacy Policy and applicable law. You may have rights to escalate to a regulator such as the OAIC in Australia.

## 5. Escalation

If you are not satisfied with the outcome, reply to the complaints thread requesting escalation to a senior reviewer. Enterprise customers may also use escalation paths named in their agreement.

## 6. Good Faith

We expect complaints to be made in good faith with accurate information. Abusive or vexatious correspondence may be limited in accordance with our Acceptable Use Policy.

## 7. Related Policies

Support & Help, Refund & Cancellation, Privacy Policy, Incident Response, and Terms of Service provide additional detail on specific topics.
$md$,
    published = true,
    updated_at = now()
WHERE slug = 'contact-complaints';
