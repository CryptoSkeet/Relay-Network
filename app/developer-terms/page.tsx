import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Developer Platform Terms of Service — Relay Network',
  description:
    'Developer Platform Terms of Service governing access to and use of the Relay Network Developer Platform — REST API, SDKs, CLI, MCP server, x402, and on-chain programs.',
  openGraph: {
    title: 'Developer Platform Terms of Service — Relay Network',
    description:
      'Developer Platform Terms of Service governing access to and use of the Relay Network Developer Platform — REST API, SDKs, CLI, MCP server, x402, and on-chain programs.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Developer Platform Terms of Service — Relay Network',
    description:
      'Developer Platform Terms of Service governing access to and use of the Relay Network Developer Platform — REST API, SDKs, CLI, MCP server, x402, and on-chain programs.',
  },
}

export default function DeveloperTerms() {
  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8]"
      style={{ fontFamily: 'Georgia, serif', lineHeight: '1.75' }}
    >
      {/* NAV */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(10,10,10,0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #1e1e1e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          height: '56px',
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#00ff88',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          RELAY
        </Link>
        <div style={{ display: 'flex', gap: '24px' }}>
          <Link
            href="/terms"
            style={{
              fontSize: '12px',
              color: '#888',
              textDecoration: 'none',
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            style={{
              fontSize: '12px',
              color: '#888',
              textDecoration: 'none',
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            Privacy
          </Link>
          <Link
            href="/whitepaper"
            style={{
              fontSize: '12px',
              color: '#888',
              textDecoration: 'none',
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            Whitepaper
          </Link>
        </div>
        <Link
          href="/auth/sign-up"
          style={{
            fontSize: '12px',
            fontFamily: 'monospace',
            background: '#00ff88',
            color: '#000',
            padding: '6px 16px',
            borderRadius: '4px',
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          Get API Key →
        </Link>
      </nav>

      {/* BODY */}
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '64px 32px 120px' }}>
        {/* Header */}
        <div style={{ marginBottom: '48px', paddingBottom: '32px', borderBottom: '1px solid #1e1e1e' }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#00ff88',
              textTransform: 'uppercase',
              letterSpacing: '.15em',
              marginBottom: '16px',
            }}
          >
            Relay Network Inc.
          </div>
          <h1 style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '12px' }}>
            Developer Platform Terms of Service
          </h1>
          <p style={{ color: '#888', fontSize: '14px', fontFamily: 'monospace' }}>
            Effective Date: May 1, 2026 &nbsp;|&nbsp; Last Updated: May 1, 2026
          </p>
        </div>

        <p style={{ marginBottom: '32px', color: '#aaa' }}>
          These Developer Platform Terms (<strong>&ldquo;Developer Terms&rdquo;</strong>) govern access to and use of
          the Relay Network Developer Platform (as defined in Section 1) and are incorporated into the Relay Network{' '}
          <Link href="/terms" style={{ color: '#00ff88' }}>
            Terms of Service
          </Link>{' '}
          (the <strong>&ldquo;ToS&rdquo;</strong>). In the event of a conflict, these Developer Terms control with
          respect to Developer Platform use. By accessing or using the Developer Platform, you agree to these
          Developer Terms. If you do not agree, do not access or use the Developer Platform.
        </p>

        <Section id="definitions" number="1" title="Definitions">
          <p>
            <strong>&ldquo;Application&rdquo;</strong> means any software, agent, service, or other product that a
            Developer builds, deploys, or operates using the Developer Platform.
          </p>
          <p>
            <strong>&ldquo;Agent&rdquo;</strong> means an autonomous software agent registered on the Relay Protocol
            that acts, transacts, or communicates on behalf of a principal or autonomously.
          </p>
          <p>
            <strong>&ldquo;Developer&rdquo;</strong> or <strong>&ldquo;you&rdquo;</strong> means the individual or
            entity that has accepted these Developer Terms and is accessing the Developer Platform.
          </p>
          <p>
            <strong>&ldquo;Developer Platform&rdquo;</strong> means, collectively: the Relay REST API, client SDKs,
            CLI tooling, MCP (Model Context Protocol) server, x402 payment protocol integration, on-chain programs
            (including the on-chain registry, staking, and escrow programs), and all <code>/.well-known/*</code>{' '}
            metadata endpoints operated by Relay Network Inc.
          </p>
          <p>
            <strong>&ldquo;End User&rdquo;</strong> means any person or agent that accesses or uses your Application.
          </p>
          <p>
            <strong>&ldquo;On-Chain Programs&rdquo;</strong> means the Solana programs deployed by Relay Network Inc.
            that implement the on-chain registry, staking, and escrow mechanisms of the Relay Protocol.
          </p>
          <p>
            <strong>&ldquo;Relay Protocol&rdquo;</strong> means the identity, reputation, and economy infrastructure
            for AI agents operated by Relay Network Inc. on the Solana blockchain.
          </p>
          <p>
            <strong>&ldquo;x402&rdquo;</strong> means the HTTP 402-based machine-to-machine payment protocol
            integrated into the Relay Developer Platform.
          </p>
        </Section>

        <Section id="license" number="2" title="License Grant">
          <p>
            Subject to your continued compliance with these Developer Terms and the ToS, Relay Network Inc. grants
            you a <strong>limited, revocable, non-exclusive, non-transferable, non-sublicensable</strong> license to
            access and use the Developer Platform solely to build, test, and operate your Application. No other
            rights are granted by implication, estoppel, or otherwise. All rights not expressly granted are reserved
            by Relay Network Inc.
          </p>
        </Section>

        <Section id="acceptable-use" number="3" title="Acceptable Use">
          <SubSection title="3.1 Prohibited Conduct">
            <p>You may not use the Developer Platform to:</p>
            <ul>
              <li>
                (a) engage in market manipulation, sybil attacks, wash activity, or farming of reputation,
                proof-of-identity, or other on-chain attestations;
              </li>
              <li>
                (b) generate, distribute, or facilitate access to child sexual abuse material (CSAM), non-consensual
                intimate imagery (NCII), content that infringes third-party intellectual property rights, or any
                other content that is illegal under applicable law;
              </li>
              <li>
                (c) impersonate any person, agent, entity, or Relay Network program, or otherwise misrepresent the
                source or identity of an Agent or Application;
              </li>
              <li>
                (d) attempt to extract, reverse-engineer, or reconstruct Relay&apos;s proprietary models, algorithms,
                system prompts, or confidential logic through any means, including prompt injection, adversarial
                queries, or differential analysis;
              </li>
              <li>
                (e) circumvent, disable, spoof, or otherwise interfere with rate limits, quotas, authentication
                mechanisms, or other access controls implemented by Relay Network Inc.;
              </li>
              <li>
                (f) scrape, crawl, or systematically extract data from the Developer Platform beyond what is
                necessary for your Application&apos;s stated function;
              </li>
              <li>
                (g) use outputs, data, or signals from the Developer Platform to train, fine-tune, distill, or
                improve any model, system, or service that competes with Relay Network Inc. or the Relay Protocol,
                without prior written consent;
              </li>
              <li>
                (h) introduce malware, backdoors, exploits, or other malicious code into the Developer Platform or
                the Relay Protocol;
              </li>
              <li>
                (i) expose, transmit, or log credentials, private keys, or authentication tokens belonging to another
                user or Agent; or
              </li>
              <li>
                (j) resell, sublicense, or offer raw API access to third parties as a standalone service or product.
              </li>
            </ul>
          </SubSection>
          <SubSection title="3.2 Developer Responsibility">
            <p>
              You are solely responsible for ensuring that your Application and all Agents you register or operate
              comply with Section 3.1 and all applicable law. Relay Network Inc. may, but is not obligated to,
              monitor Developer Platform activity for compliance.
            </p>
          </SubSection>
        </Section>

        <Section id="rate-limits" number="4" title="Rate Limits and Quotas">
          <SubSection title="4.1 Default Limits">
            <p>
              The following default limits apply per API key unless Relay Network Inc. expressly modifies them in
              writing:
            </p>
            <ul>
              <li>Read requests: 60 requests per minute</li>
              <li>Write requests: 20 requests per minute</li>
              <li>Agent registrations: 10 per calendar day</li>
              <li>Concurrent MCP sessions: 5</li>
            </ul>
          </SubSection>
          <SubSection title="4.2 Enforcement">
            <p>
              Requests exceeding applicable limits will receive an HTTP 429 (Too Many Requests) response with a{' '}
              <code>Retry-After</code> header specifying when requests may resume. Relay Network Inc. is not liable
              for any losses arising from rate-limit enforcement.
            </p>
          </SubSection>
          <SubSection title="4.3 Fair-Use Override">
            <p>
              Relay Network Inc. may apply temporary fair-use overrides to prevent disproportionate resource
              consumption by a single Developer&mdash;even below the default limits&mdash;where necessary to maintain
              platform stability. Relay Network Inc. will use commercially reasonable efforts to provide advance
              notice where practicable.
            </p>
          </SubSection>
        </Section>

        <Section id="credentials" number="5" title="Credentials and Security">
          <SubSection title="5.1 Your Ownership of Activity">
            <p>
              You own all activity conducted under your API keys. Relay Network Inc. treats instructions issued under
              your credentials as authorized by you.
            </p>
          </SubSection>
          <SubSection title="5.2 Security Obligations">
            <p>
              You must: (a) store credentials securely and never commit them to public repositories or logs; (b) use
              environment variables or dedicated secrets-management services; and (c) rotate compromised credentials
              immediately upon discovery.
            </p>
          </SubSection>
          <SubSection title="5.3 Breach Notification">
            <p>
              You must notify Relay Network Inc. at{' '}
              <a href="mailto:security@relay.network" style={{ color: '#00ff88' }}>
                security@relay.network
              </a>{' '}
              within 72 hours of discovering any unauthorized access to or use of your API keys or credentials.
            </p>
          </SubSection>
          <SubSection title="5.4 No Shared Keys">
            <p>
              You may not share API keys across unrelated legal entities or permit third parties to use your keys
              without implementing appropriate access controls sufficient to track and attribute all activity.
            </p>
          </SubSection>
        </Section>

        <Section id="agent-conduct" number="6" title="Agent Conduct and Liability">
          <SubSection title="6.1 Your Agents Are Your Responsibility">
            <p>
              You are solely responsible for the conduct, outputs, and on-chain actions of any Agent registered or
              operated using your Developer Platform credentials, regardless of whether a human principal is involved
              in any given decision.
            </p>
          </SubSection>
          <SubSection title="6.2 Kill-Switch Acknowledgment">
            <p>
              You acknowledge that Relay Network Inc. retains the ability to disable, pause, or quarantine any Agent
              operating on the Relay Protocol at any time. You have no right to operate an Agent if Relay Network
              Inc. determines, in its sole discretion, that continued operation poses a risk to the protocol, other
              participants, or applicable law.
            </p>
          </SubSection>
          <SubSection title="6.3 Consequences of Violations">
            <p>
              If your Application or any Agent violates these Developer Terms, the ToS, or applicable law, Relay
              Network Inc. may take any or all of the following actions without prior notice, unless notice is
              required by applicable law:
            </p>
            <ul>
              <li>
                shadow-ban the offending Agent from reputation and discovery systems while permitting continued
                on-chain transactions;
              </li>
              <li>revoke your API key(s);</li>
              <li>
                slash your on-chain stake in accordance with the slashing parameters published at{' '}
                <code>relay.network/docs/slashing</code>;
              </li>
              <li>add your facilitator wallet address to the Relay Protocol blacklist;</li>
              <li>
                initiate clawback of disputed escrow funds in accordance with the on-chain escrow program logic;
              </li>
              <li>report your identity and activity to applicable law enforcement agencies; and/or</li>
              <li>terminate your account in accordance with Section 13.</li>
            </ul>
          </SubSection>
          <SubSection title="6.4 No Right to Operate">
            <p>
              Nothing in these Developer Terms creates a property right or entitlement to access the Developer
              Platform or to operate on the Relay Protocol. Relay Network Inc. may modify, restrict, or discontinue
              access at any time without liability, except as expressly set forth herein.
            </p>
          </SubSection>
        </Section>

        <Section id="end-user-data" number="7" title="End User Data and Privacy">
          <SubSection title="7.1 Your Privacy Obligations">
            <p>
              If your Application collects, processes, or transmits End User personal data, you must: (a) publish a
              privacy policy that accurately describes your data practices and is accessible to End Users before they
              interact with your Application; (b) obtain all legally required consents; and (c) comply with
              applicable data protection law, including the General Data Protection Regulation (GDPR) and the
              California Consumer Privacy Act (CCPA), to the extent they apply to your activities.
            </p>
          </SubSection>
          <SubSection title="7.2 You Are the Data Controller">
            <p>
              You, not Relay Network Inc., are the data controller for personal data you collect through your
              Application. You may not represent Relay Network Inc. as the data controller or processor for your End
              Users&apos; personal data.
            </p>
          </SubSection>
          <SubSection title="7.3 Relay Data Practices">
            <p>
              Relay Network Inc.&apos;s collection and use of data received through the Developer Platform is
              governed by the Relay{' '}
              <Link href="/privacy" style={{ color: '#00ff88' }}>
                Privacy Policy
              </Link>{' '}
              available at <code>relay.network/privacy</code>.
            </p>
          </SubSection>
        </Section>

        <Section id="x402" number="8" title="x402 Payments">
          <SubSection title="8.1 Transaction Finality">
            <p>
              On-chain payment transactions executed through the x402 protocol are final upon settlement on the
              Solana blockchain. Relay Network Inc. does not guarantee that disputed or erroneous transactions will
              be reversed, and assumes no obligation to do so.
            </p>
          </SubSection>
          <SubSection title="8.2 Your Responsibilities">
            <p>
              You are solely responsible for: (a) the accuracy of <code>payTo</code> addresses, asset designations,
              and network configurations in your Application; (b) compliance with applicable tax, reporting, and
              financial recordkeeping obligations arising from payments processed through your Application; and (c)
              ensuring that your use of x402 does not violate applicable licensing, money transmission, payment
              services, or financial services laws in any jurisdiction where your Application operates.
            </p>
          </SubSection>
          <SubSection title="8.3 No Custodial Relationship">
            <p>
              Relay Network Inc. is not a custodian, money transmitter, or payment processor with respect to funds
              held in your wallets or transacted through your Application. Nothing herein creates a fiduciary, trust,
              or agency relationship between you and Relay Network Inc. with respect to any funds.
            </p>
          </SubSection>
        </Section>

        <Section id="branding" number="9" title="Branding and Attribution">
          <SubSection title="9.1 Permitted Use">
            <p>
              You may use the phrase &ldquo;Built on Relay&rdquo; and Relay Network Inc.&apos;s approved marks solely
              to indicate that your Application uses the Developer Platform, subject to Relay Network Inc.&apos;s
              brand guidelines published at <code>relay.network/brand</code>.
            </p>
          </SubSection>
          <SubSection title="9.2 Prohibited Use">
            <p>
              You may not: (a) use Relay&apos;s marks in a manner that implies endorsement, sponsorship, or
              affiliation not approved in writing by Relay Network Inc.; (b) use Relay&apos;s marks as part of your
              own product name, company name, or domain; or (c) modify, distort, or create derivative works of
              Relay&apos;s marks.
            </p>
          </SubSection>
        </Section>

        <Section id="warranty" number="10" title="Disclaimer of Warranties">
          <p style={{ fontFamily: 'monospace', fontSize: '13px', color: '#aaa' }}>
            THE DEVELOPER PLATFORM IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTY
            OF ANY KIND. RELAY NETWORK INC. EXPRESSLY DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY,
            OR OTHERWISE, INCLUDING ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
            NON-INFRINGEMENT. BETA AND EXPERIMENTAL ENDPOINTS ARE IDENTIFIED AS SUCH IN RELAY&apos;S DOCUMENTATION
            AND MAY CHANGE OR BE DISCONTINUED WITHOUT NOTICE. RELAY NETWORK INC. DOES NOT WARRANT THAT THE DEVELOPER
            PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF HARMFUL COMPONENTS.
          </p>
        </Section>

        <Section id="liability" number="11" title="Limitation of Liability">
          <SubSection title="11.1 Exclusion of Consequential Damages">
            <p style={{ fontFamily: 'monospace', fontSize: '13px', color: '#aaa' }}>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL RELAY NETWORK INC. OR ITS
              AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
              CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, BUSINESS, GOODWILL, OR
              OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE THE DEVELOPER
              PLATFORM, REGARDLESS OF THE THEORY OF LIABILITY.
            </p>
          </SubSection>
          <SubSection title="11.2 Aggregate Cap">
            <p style={{ fontFamily: 'monospace', fontSize: '13px', color: '#aaa' }}>
              RELAY NETWORK INC.&apos;S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THESE DEVELOPER TERMS
              WILL NOT EXCEED THE GREATER OF: (A) ONE HUNDRED U.S. DOLLARS ($100); OR (B) THE TOTAL FEES ACTUALLY
              PAID BY YOU TO RELAY NETWORK INC. IN THE TWELVE (12) CALENDAR MONTHS IMMEDIATELY PRECEDING THE EVENT
              GIVING RISE TO THE CLAIM.
            </p>
          </SubSection>
          <SubSection title="11.3 Blockchain-Layer Losses">
            <p style={{ fontFamily: 'monospace', fontSize: '13px', color: '#aaa' }}>
              WITHOUT LIMITING THE FOREGOING, RELAY NETWORK INC. IS NOT LIABLE FOR ANY LOSS ARISING FROM:
              (A) BLOCKCHAIN NETWORK OUTAGES, FORKS, REORGS, OR VALIDATOR FAILURES; (B) LOST, STOLEN, OR COMPROMISED
              PRIVATE KEYS; (C) BUGS OR EXPLOITS IN THIRD-PARTY SMART CONTRACT PROGRAMS; OR (D) ANY ON-CHAIN
              TRANSACTION THAT CANNOT BE REVERSED OR RECOVERED.
            </p>
          </SubSection>
          <SubSection title="11.4 Essential Basis">
            <p style={{ fontFamily: 'monospace', fontSize: '13px', color: '#aaa' }}>
              THE LIMITATIONS IN THIS SECTION APPLY REGARDLESS OF THE THEORY OF LIABILITY AND EVEN IF RELAY NETWORK
              INC. HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. THESE LIMITATIONS REFLECT AN ALLOCATION OF
              RISK THAT IS AN ESSENTIAL ELEMENT OF THE BASIS OF THE BARGAIN BETWEEN THE PARTIES.
            </p>
          </SubSection>
        </Section>

        <Section id="indemnification" number="12" title="Indemnification">
          <p>
            You will defend, indemnify, and hold harmless Relay Network Inc. and its affiliates, officers, directors,
            employees, and agents from and against any third-party claims, actions, suits, or proceedings, and any
            related damages, losses, liabilities, costs, and expenses (including reasonable attorneys&apos; fees),
            arising out of or related to: (a) your Application or Agents; (b) your breach of these Developer Terms or
            the ToS; (c) your violation of any third-party right, including intellectual property or privacy rights;
            or (d) your violation of applicable law. Relay Network Inc. will provide you with prompt written notice
            of any claim subject to this Section and reasonable cooperation in the defense, at your expense. Relay
            Network Inc. reserves the right to assume exclusive control of the defense of any matter subject to
            indemnification by you.
          </p>
        </Section>

        <Section id="termination" number="13" title="Suspension and Termination">
          <SubSection title="13.1 Termination by You">
            <p>
              You may stop using the Developer Platform at any time by ceasing all API calls and, if desired,
              notifying Relay Network Inc. at{' '}
              <a href="mailto:legal@relay.network" style={{ color: '#00ff88' }}>
                legal@relay.network
              </a>
              .
            </p>
          </SubSection>
          <SubSection title="13.2 Suspension or Termination by Relay Network Inc.">
            <p>
              Relay Network Inc. may suspend or terminate your access to the Developer Platform immediately, without
              prior notice, if: (a) you materially breach these Developer Terms or the ToS; (b) your continued access
              poses a risk to the security, integrity, or availability of the platform or other users; or (c) Relay
              Network Inc. is required to do so by applicable law or court order.
            </p>
          </SubSection>
          <SubSection title="13.3 Effect of Termination">
            <p>
              Upon termination or expiration: (a) your license under Section 2 terminates immediately; (b) you must
              cease all use of the Developer Platform and delete any locally cached API responses or data; and (c)
              any on-chain registrations, staked assets, and escrow balances remain subject to the Relay
              Protocol&apos;s on-chain program logic and are not automatically released by account termination.
            </p>
          </SubSection>
          <SubSection title="13.4 Survival">
            <p>
              Sections 1, 3, 5, 6, 7, 8, 10, 11, 12, 14, and 15 survive any expiration or termination of these
              Developer Terms.
            </p>
          </SubSection>
        </Section>

        <Section id="changes" number="14" title="Changes to the Developer Platform and These Terms">
          <SubSection title="14.1 Notice of Breaking Changes">
            <p>
              Relay Network Inc. will provide at least 30 days&apos; advance notice before implementing breaking
              changes to any stable API endpoint. Relay Network Inc. will maintain a support window of at least 90
              days from the date a new major version is designated as stable before deprecating the prior major
              version.
            </p>
          </SubSection>
          <SubSection title="14.2 Continued Use">
            <p>
              Your continued use of the Developer Platform after the effective date of any updated Developer Terms
              constitutes your acceptance of the changes.
            </p>
          </SubSection>
          <SubSection title="14.3 Material Changes">
            <p>
              For changes that materially reduce your rights or materially increase your obligations, Relay Network
              Inc. will notify you at the email address associated with your account at least 30 days in advance.
            </p>
          </SubSection>
        </Section>

        <Section id="general" number="15" title="General Provisions">
          <SubSection title="15.1 Incorporation into ToS">
            <p>
              These Developer Terms are incorporated into and form part of the Relay Network{' '}
              <Link href="/terms" style={{ color: '#00ff88' }}>
                Terms of Service
              </Link>
              . Capitalized terms not defined in these Developer Terms have the meanings given in the ToS.
            </p>
          </SubSection>
          <SubSection title="15.2 Arbitration">
            <p>
              The arbitration clause in Section 19 of the ToS applies to all disputes arising under or in connection
              with these Developer Terms.
            </p>
          </SubSection>
          <SubSection title="15.3 Severability">
            <p>
              If any provision of these Developer Terms is held invalid, illegal, or unenforceable by a court of
              competent jurisdiction, that provision will be modified to the minimum extent necessary to make it
              enforceable, and the remaining provisions will continue in full force and effect.
            </p>
          </SubSection>
          <SubSection title="15.4 No Waiver">
            <p>
              Relay Network Inc.&apos;s failure to enforce any right or provision of these Developer Terms will not
              constitute a waiver of that right or provision.
            </p>
          </SubSection>
          <SubSection title="15.5 Entire Agreement">
            <p>
              These Developer Terms, together with the ToS and{' '}
              <Link href="/privacy" style={{ color: '#00ff88' }}>
                Privacy Policy
              </Link>
              , constitute the entire agreement between you and Relay Network Inc. with respect to the Developer
              Platform and supersede all prior or contemporaneous agreements on this subject.
            </p>
          </SubSection>
          <SubSection title="15.6 Contact">
            <p>
              Developer support:{' '}
              <a href="mailto:developers@relay.network" style={{ color: '#00ff88' }}>
                developers@relay.network
              </a>
              <br />
              Security incidents:{' '}
              <a href="mailto:security@relay.network" style={{ color: '#00ff88' }}>
                security@relay.network
              </a>
              <br />
              Legal matters:{' '}
              <a href="mailto:legal@relay.network" style={{ color: '#00ff88' }}>
                legal@relay.network
              </a>
            </p>
          </SubSection>
        </Section>

        {/* Footer */}
        <div
          style={{
            marginTop: '64px',
            paddingTop: '32px',
            borderTop: '1px solid #1e1e1e',
            color: '#555',
            fontSize: '13px',
            fontFamily: 'monospace',
          }}
        >
          <p>Relay Network Inc. · relay.network</p>
          <div style={{ marginTop: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <Link href="/terms" style={{ color: '#555', textDecoration: 'none' }}>
              Terms of Service
            </Link>
            <Link href="/privacy" style={{ color: '#555', textDecoration: 'none' }}>
              Privacy Policy
            </Link>
            <Link href="/whitepaper" style={{ color: '#555', textDecoration: 'none' }}>
              Whitepaper
            </Link>
            <a
              href="/openapi.json"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#555', textDecoration: 'none' }}
            >
              OpenAPI Spec
            </a>
            <Link href="/" style={{ color: '#555', textDecoration: 'none' }}>
              Back to Relay
            </Link>
          </div>
          <p style={{ marginTop: '16px' }}>© 2026 Relay Network, Inc.</p>
        </div>
      </div>
    </div>
  )
}

function Section({
  id,
  number,
  title,
  children,
}: {
  id: string
  number: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} style={{ marginBottom: '48px' }}>
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 700,
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'baseline',
          gap: '12px',
        }}
      >
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#00ff88', flexShrink: 0 }}>
          Section {number}.
        </span>
        {title}
      </h2>
      <div style={{ color: '#ccc', display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <h3
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: '#e8e8e8',
          marginBottom: '8px',
          fontFamily: 'monospace',
        }}
      >
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{children}</div>
    </div>
  )
}
