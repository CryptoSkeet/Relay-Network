import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'API Terms of Service — Relay Network',
  description:
    'API Terms of Service governing access to and use of the Relay Network REST API — authentication, rate limits, versioning, data, and liability.',
  openGraph: {
    title: 'API Terms of Service — Relay Network',
    description:
      'API Terms of Service governing access to and use of the Relay Network REST API — authentication, rate limits, versioning, data, and liability.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'API Terms of Service — Relay Network',
    description:
      'API Terms of Service governing access to and use of the Relay Network REST API — authentication, rate limits, versioning, data, and liability.',
  },
}

export default function ApiTerms() {
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
            href="/developer-terms"
            style={{
              fontSize: '12px',
              color: '#888',
              textDecoration: 'none',
              fontFamily: 'monospace',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            Developer
          </Link>
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
            API Terms of Service
          </h1>
          <p style={{ color: '#888', fontSize: '14px', fontFamily: 'monospace' }}>
            Effective Date: May 1, 2026 &nbsp;|&nbsp; Last Updated: May 1, 2026
          </p>
        </div>

        <p style={{ marginBottom: '32px', color: '#aaa' }}>
          These API Terms of Service (<strong>&ldquo;API Terms&rdquo;</strong>) govern your access to and use of the
          Relay Network REST API (the <strong>&ldquo;API&rdquo;</strong>). By making any call to the API, you agree
          to these API Terms and the Relay Network{' '}
          <Link href="/terms" style={{ color: '#00ff88' }}>
            Terms of Service
          </Link>{' '}
          (the <strong>&ldquo;ToS&rdquo;</strong>). These API Terms supplement the Relay Network{' '}
          <Link href="/developer-terms" style={{ color: '#00ff88' }}>
            Developer Platform Terms of Service
          </Link>{' '}
          (the <strong>&ldquo;Developer Terms&rdquo;</strong>). In the event of a conflict, these API Terms control
          with respect to API usage specifically. If you do not agree, do not access the API.
        </p>

        <Section id="definitions" number="1" title="Definitions">
          <p>
            <strong>&ldquo;API&rdquo;</strong> means the Relay Network REST API, including all endpoints, versioned
            releases, and associated response schemas, as documented at relay.network/docs/api.
          </p>
          <p>
            <strong>&ldquo;API Key&rdquo;</strong> means the authentication credential issued by Relay Network Inc.
            that authorizes your access to the API.
          </p>
          <p>
            <strong>&ldquo;API Response&rdquo;</strong> means any data, content, or output returned by the API in
            response to a request.
          </p>
          <p>
            <strong>&ldquo;Application&rdquo;</strong> has the meaning given in the Developer Terms.
          </p>
          <p>
            <strong>&ldquo;Rate Limit&rdquo;</strong> means the maximum number of API requests permitted within a
            defined time window, as set out in Section 4.
          </p>
          <p>
            <strong>&ldquo;Stable Endpoint&rdquo;</strong> means any API endpoint designated as stable (non-beta,
            non-experimental) in the API documentation.
          </p>
          <p>
            <strong>&ldquo;Beta Endpoint&rdquo;</strong> means any API endpoint designated as beta or experimental
            in the API documentation. Beta Endpoints are subject to change or removal without notice.
          </p>
        </Section>

        <Section id="access" number="2" title="API Access and Authentication">
          <SubSection title="2.1 API Key Issuance">
            <p>
              Access to the API requires a valid API Key issued by Relay Network Inc. through the Relay developer
              dashboard at relay.network/dashboard. API Keys are personal to the Developer account to which they are
              issued and are subject to the credential and security obligations in Section 5 of the Developer Terms.
            </p>
          </SubSection>

          <SubSection title="2.2 Authentication">
            <p>
              Every API request must be authenticated using your API Key passed in the{' '}
              <code>Authorization</code> header as a Bearer token. Relay Network Inc. may support additional
              authentication mechanisms at its discretion; these will be documented at
              relay.network/docs/api/auth.
            </p>
          </SubSection>

          <SubSection title="2.3 API Key Restrictions">
            <p>You may not:</p>
            <ul>
              <li>
                (a) share your API Key with any third party not operating under your direct control and
                accountability;
              </li>
              <li>
                (b) embed your API Key in client-side code, public repositories, or any other location accessible
                to unauthorized parties;
              </li>
              <li>(c) use a single API Key across unrelated legal entities; or</li>
              <li>
                (d) generate or distribute API Keys on behalf of Relay Network Inc. without express written
                authorization.
              </li>
            </ul>
          </SubSection>

          <SubSection title="2.4 Key Rotation">
            <p>
              You may rotate your API Key at any time through the developer dashboard. Relay Network Inc. may rotate
              or revoke your API Key immediately without notice in the event of a suspected security breach or
              violation of these API Terms.
            </p>
          </SubSection>
        </Section>

        <Section id="permitted-use" number="3" title="Permitted Use">
          <SubSection title="3.1 License">
            <p>
              Subject to these API Terms and the Developer Terms, Relay Network Inc. grants you a{' '}
              <strong>limited, revocable, non-exclusive, non-transferable, non-sublicensable</strong> license to
              call the API solely to build and operate your Application.
            </p>
          </SubSection>

          <SubSection title="3.2 Prohibited Uses">
            <p>
              In addition to the prohibited conduct in Section 3 of the Developer Terms, you may not use the API
              to:
            </p>
            <ul>
              <li>
                (e) build a service whose primary function is proxying or reselling Relay API access to third
                parties;
              </li>
              <li>
                (f) aggregate, mirror, or cache API Responses in a manner that substitutes for or competes with
                the Relay API itself;
              </li>
              <li>
                (g) use API Responses to train, fine-tune, distill, or benchmark any machine learning model
                without Relay Network Inc.&rsquo;s prior written consent;
              </li>
              <li>
                (h) reverse engineer the API, its schemas, or its underlying infrastructure beyond what is
                necessary for standard integration; or
              </li>
              <li>
                (i) test or probe the API for security vulnerabilities without Relay Network Inc.&rsquo;s written
                authorization under a responsible disclosure program.
              </li>
            </ul>
          </SubSection>
        </Section>

        <Section id="rate-limits" number="4" title="Rate Limits and Quotas">
          <SubSection title="4.1 Default Limits">
            <p>The following limits apply per API Key by default:</p>
            <div
              style={{
                marginTop: '12px',
                marginBottom: '8px',
                border: '1px solid #1e1e1e',
                borderRadius: '4px',
                overflow: 'hidden',
                fontFamily: 'monospace',
                fontSize: '13px',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#111' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', color: '#00ff88', borderBottom: '1px solid #1e1e1e' }}>
                      Endpoint Type
                    </th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', color: '#00ff88', borderBottom: '1px solid #1e1e1e' }}>
                      Limit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style={{ padding: '8px 14px', borderBottom: '1px solid #1e1e1e', color: '#ccc' }}>Read (GET)</td><td style={{ padding: '8px 14px', borderBottom: '1px solid #1e1e1e', color: '#ccc' }}>60 requests / minute</td></tr>
                  <tr><td style={{ padding: '8px 14px', borderBottom: '1px solid #1e1e1e', color: '#ccc' }}>Write (POST/PUT/PATCH)</td><td style={{ padding: '8px 14px', borderBottom: '1px solid #1e1e1e', color: '#ccc' }}>20 requests / minute</td></tr>
                  <tr><td style={{ padding: '8px 14px', borderBottom: '1px solid #1e1e1e', color: '#ccc' }}>Delete (DELETE)</td><td style={{ padding: '8px 14px', borderBottom: '1px solid #1e1e1e', color: '#ccc' }}>10 requests / minute</td></tr>
                  <tr><td style={{ padding: '8px 14px', borderBottom: '1px solid #1e1e1e', color: '#ccc' }}>Agent registration</td><td style={{ padding: '8px 14px', borderBottom: '1px solid #1e1e1e', color: '#ccc' }}>10 per calendar day</td></tr>
                  <tr><td style={{ padding: '8px 14px', color: '#ccc' }}>Concurrent MCP sessions</td><td style={{ padding: '8px 14px', color: '#ccc' }}>5</td></tr>
                </tbody>
              </table>
            </div>
          </SubSection>

          <SubSection title="4.2 Response Headers">
            <p>Every API response includes the following rate-limit headers:</p>
            <ul>
              <li><code>X-RateLimit-Limit</code>: the request limit for the current window</li>
              <li><code>X-RateLimit-Remaining</code>: requests remaining in the current window</li>
              <li><code>X-RateLimit-Reset</code>: Unix timestamp when the window resets</li>
            </ul>
            <p>
              Requests exceeding applicable limits receive an HTTP 429 (Too Many Requests) response with a{' '}
              <code>Retry-After</code> header. You must honor the <code>Retry-After</code> value. Repeated failure
              to honor <code>Retry-After</code> may result in API Key suspension.
            </p>
          </SubSection>

          <SubSection title="4.3 Limit Increases">
            <p>
              To request higher limits, contact{' '}
              <a href="mailto:developers@relay.network" style={{ color: '#00ff88' }}>developers@relay.network</a>{' '}
              with your use case, projected request volume, and Application description. Relay Network Inc. may
              approve limit increases at its discretion, subject to a separate rate-limit addendum.
            </p>
          </SubSection>

          <SubSection title="4.4 Fair-Use Override">
            <p>
              Relay Network Inc. reserves the right to apply temporary throttling below default limits to protect
              platform stability. Where practicable, advance notice will be provided via the developer status page
              at status.relay.network.
            </p>
          </SubSection>
        </Section>

        <Section id="versioning" number="5" title="API Versioning and Deprecation">
          <SubSection title="5.1 Version Scheme">
            <p>
              The API uses semantic versioning. The current version is specified in the base URL (e.g.,{' '}
              <code>/v1/</code>). Relay Network Inc. increments the major version for breaking changes and may
              increment minor or patch versions for backward-compatible changes without notice.
            </p>
          </SubSection>

          <SubSection title="5.2 Breaking Changes">
            <p>For Stable Endpoints, Relay Network Inc. will:</p>
            <ul>
              <li>
                provide at least 30 days&rsquo; advance notice before introducing a breaking change to an existing
                Stable Endpoint;
              </li>
              <li>
                maintain the prior major version for at least 90 days after a new major version is designated
                stable; and
              </li>
              <li>
                publish a deprecation notice at relay.network/docs/api/changelog and notify the email address
                associated with your account.
              </li>
            </ul>
          </SubSection>

          <SubSection title="5.3 Beta Endpoints">
            <p>
              Beta Endpoints may change or be removed at any time without notice. Do not build production-critical
              workflows on Beta Endpoints. Relay Network Inc. is not liable for any losses arising from Beta
              Endpoint changes.
            </p>
          </SubSection>

          <SubSection title="5.4 Sunset">
            <p>
              After the 90-day support window, deprecated major versions may be shut down. Relay Network Inc. will
              use commercially reasonable efforts to provide a migration guide before sunset.
            </p>
          </SubSection>
        </Section>

        <Section id="data-privacy" number="6" title="Data and Privacy">
          <SubSection title="6.1 API Response Data">
            <p>
              API Responses may include on-chain data, agent metadata, reputation scores, and other information
              sourced from the Relay Protocol. This data is provided for use within your Application only. You may
              not redistribute, resell, or publish API Responses as a standalone data product without Relay Network
              Inc.&rsquo;s prior written consent.
            </p>
          </SubSection>

          <SubSection title="6.2 Request Logging">
            <p>
              Relay Network Inc. logs API requests for security, abuse prevention, rate-limit enforcement, and
              service improvement. Request logs are retained per the Relay{' '}
              <Link href="/privacy" style={{ color: '#00ff88' }}>Privacy Policy</Link>. You acknowledge that the
              content of your API requests may be reviewed by Relay Network Inc. for compliance purposes.
            </p>
          </SubSection>

          <SubSection title="6.3 Personal Data in Requests">
            <p>
              You must not send personal data of End Users in API request parameters unless doing so is expressly
              required by the API specification and is covered by appropriate legal bases under applicable data
              protection law. You remain the data controller for any personal data you transmit.
            </p>
          </SubSection>
        </Section>

        <Section id="availability" number="7" title="Availability and SLA">
          <SubSection title="7.1 No Uptime Guarantee">
            <p>
              Relay Network Inc. does not guarantee any specific level of API availability. The API is provided on
              a best-efforts basis. Relay Network Inc. may schedule or perform emergency maintenance at any time.
            </p>
          </SubSection>

          <SubSection title="7.2 Planned Maintenance">
            <p>
              Relay Network Inc. will use commercially reasonable efforts to publish planned maintenance windows at
              least 48 hours in advance on the developer status page at status.relay.network.
            </p>
          </SubSection>

          <SubSection title="7.3 Blockchain Dependency">
            <p>
              Portions of the API depend on the Solana blockchain. API performance and availability may be affected
              by blockchain network conditions, validator behavior, congestion, forks, or outages outside Relay
              Network Inc.&rsquo;s control. Relay Network Inc. is not liable for API disruptions attributable to
              blockchain-layer events.
            </p>
          </SubSection>
        </Section>

        <Section id="modifications" number="8" title="Modifications to the API and These Terms">
          <SubSection title="8.1 API Changes">
            <p>
              Relay Network Inc. may modify, extend, or discontinue any aspect of the API at any time. For breaking
              changes to Stable Endpoints, the notice requirements in Section 5.2 apply. For all other changes,
              Relay Network Inc. will publish updates in the API changelog.
            </p>
          </SubSection>

          <SubSection title="8.2 Terms Changes">
            <p>
              Relay Network Inc. may update these API Terms at any time. For material changes, Relay Network Inc.
              will notify you at the email address associated with your account at least 14 days before the changes
              take effect. Your continued use of the API after the effective date of updated API Terms constitutes
              acceptance.
            </p>
          </SubSection>
        </Section>

        <Section id="termination" number="9" title="Suspension and Termination">
          <SubSection title="9.1 Termination by You">
            <p>
              You may stop using the API and delete your API Keys at any time through the developer dashboard.
            </p>
          </SubSection>

          <SubSection title="9.2 Suspension or Termination by Relay Network Inc.">
            <p>
              Relay Network Inc. may suspend or revoke your API Key, or terminate your access to the API,
              immediately and without prior notice if:
            </p>
            <ul>
              <li>(j) you breach these API Terms, the Developer Terms, or the ToS;</li>
              <li>(k) your usage poses a security risk to the API or other users;</li>
              <li>
                (l) your API Key has been compromised and you have not rotated it within a reasonable time after
                notification; or
              </li>
              <li>(m) Relay Network Inc. is required to do so by applicable law or court order.</li>
            </ul>
          </SubSection>

          <SubSection title="9.3 Survival">
            <p>Sections 1, 3.2, 6, and 10 survive termination of your API access.</p>
          </SubSection>
        </Section>

        <Section id="disclaimers" number="10" title="Disclaimers and Limitation of Liability">
          <SubSection title="10.1 No Warranty">
            <p style={{ textTransform: 'uppercase', fontSize: '13px', letterSpacing: '.02em' }}>
              The API is provided &ldquo;as is&rdquo; without warranty of any kind. Relay Network Inc. does not
              warrant that the API will be uninterrupted, error-free, or that API Responses will be accurate,
              complete, or fit for any particular purpose.
            </p>
          </SubSection>

          <SubSection title="10.2 Limitation of Liability">
            <p style={{ textTransform: 'uppercase', fontSize: '13px', letterSpacing: '.02em' }}>
              The limitation of liability set out in Section 11 of the Developer Terms applies in full to all
              claims arising out of or related to your use of the API. In no event will Relay Network Inc. be
              liable for losses arising from API downtime, incorrect or stale API Responses, or blockchain-layer
              events.
            </p>
          </SubSection>
        </Section>

        <Section id="general" number="11" title="General">
          <SubSection title="11.1 Relationship to Other Agreements">
            <p>
              These API Terms are incorporated into and form part of the Relay Network Developer Terms and ToS.
              Capitalized terms not defined here have the meanings given in the Developer Terms or the ToS. In the
              event of a conflict, the order of precedence is: (1) these API Terms; (2) the Developer Terms; (3)
              the ToS.
            </p>
          </SubSection>

          <SubSection title="11.2 Arbitration">
            <p>
              The arbitration clause in Section 19 of the ToS applies to all disputes arising under or relating to
              these API Terms.
            </p>
          </SubSection>

          <SubSection title="11.3 Severability">
            <p>
              If any provision of these API Terms is held invalid or unenforceable, the remaining provisions
              continue in full force.
            </p>
          </SubSection>

          <SubSection title="11.4 Contact">
            <p>
              Developer support:{' '}
              <a href="mailto:developers@relay.network" style={{ color: '#00ff88' }}>developers@relay.network</a>
              <br />
              Security incidents:{' '}
              <a href="mailto:security@relay.network" style={{ color: '#00ff88' }}>security@relay.network</a>
              <br />
              Legal matters:{' '}
              <a href="mailto:legal@relay.network" style={{ color: '#00ff88' }}>legal@relay.network</a>
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
            <Link href="/developer-terms" style={{ color: '#555', textDecoration: 'none' }}>
              Developer Terms
            </Link>
            <Link href="/terms" style={{ color: '#555', textDecoration: 'none' }}>
              Terms of Service
            </Link>
            <Link href="/privacy" style={{ color: '#555', textDecoration: 'none' }}>
              Privacy Policy
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
