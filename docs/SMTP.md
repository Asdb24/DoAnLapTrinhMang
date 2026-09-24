# Production SMTP and Auth email

## Implemented recovery flow

The sign-in form offers Forgot password after entering an email. It calls `resetPasswordForEmail` with the canonical origin plus `/auth/callback?type=recovery`. Allow that exact callback in Supabase Auth. Recovery templates using a token hash must link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`; set Site URL to the canonical public origin. The callback verifies a recovery token (or exchanges a PKCE code) and redirects only to `/reset-password`. This authenticated page validates matching passwords and waits for Supabase to confirm the update. Never add arbitrary user-provided redirect destinations.

Supabase Auth sends ChatAi confirmation and password-recovery emails. Configure custom SMTP in the Supabase project; the Next.js application does not need an SMTP password. This runbook uses replaceable placeholders and does not claim a provider or public domain has already been configured.

The built-in Supabase email service is intended for testing, with restricted recipients and low send limits; it is not the production delivery plan. Enable a verified custom sender before public signup. Keep authentication mail separate from marketing and disable provider click/link tracking for authentication links. [Supabase custom SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).

## 1. Establish the sender and public origin

Choose an authenticated sending domain or subdomain you control, such as the shape `auth.<OWNED_DOMAIN>`. Use a consistent From identity, such as `ChatAi <no-reply@auth.<OWNED_DOMAIN>>`, and a monitored support address for delivery problems. These are placeholders, not addresses to ship unchanged.

Choose the real public application domain separately. Set `NEXT_PUBLIC_APP_URL=https://<PUBLIC_APP_HOST>` in the application deployment and use that exact origin as Supabase Auth's Site URL. The SMTP sender domain, app domain, and Supabase project API hostname have different purposes and need not be identical. They must all be intentionally configured.

In Supabase Auth URL Configuration, allow the exact `${NEXT_PUBLIC_APP_URL}/auth/callback` route. Also allow `${NEXT_PUBLIC_APP_URL}/auth/callback?type=recovery` for the implemented recovery flow. Keep production redirects precise; development/preview environments should use their own settings. Do not send production emails to a development origin or use arbitrary request host headers to build links. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 2. Provider credentials and TLS

Create a transactional-email account, verify its sending domain, and create credentials scoped to the necessary sender/domain where the provider supports that. In Supabase Dashboard, open Authentication, the email/notification settings, and custom SMTP settings; UI labels can change.

| Setting | Value to supply |
| --- | --- |
| Sender name | Your approved ChatAi sender label |
| Sender email | Verified address on your sending domain |
| SMTP host | `<SMTP_HOST_FROM_PROVIDER>` |
| SMTP port | `<TLS_PORT_FROM_PROVIDER>` |
| SMTP username | `<SMTP_USERNAME_FROM_PROVIDER>` |
| SMTP password | `<SMTP_PASSWORD_OR_PROVIDER_API_KEY>` |
| Encryption | Provider-supported TLS mode matching its port |

Use the provider's documented TLS mode and host. Port 465 commonly uses implicit TLS; port 587 commonly uses STARTTLS. Do not substitute one port without checking provider support, disable certificate verification, or use cleartext SMTP. Check any account sandbox restrictions and daily/hourly recipient limits before testing outside your organization.

### Optional worked provider example: Resend

Resend is one possible provider, not a committed application dependency. Its official Supabase integration uses:

| Setting | Resend example |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | `<RESEND_API_KEY>` |
| Sender | Your Resend-verified domain/address |

Obtain a real provider credential privately and enter it only into Supabase SMTP settings. The literal placeholder is not a working password. Follow [Resend's Supabase SMTP instructions](https://resend.com/docs/send-with-supabase-smtp) and verify current connection options for your provider/account.

Save SMTP configuration, then test with a mailbox you control. Never put SMTP credentials into `NEXT_PUBLIC_` variables, JavaScript bundles, SQL migrations, checked-in TOML, screenshots, support tickets, or application logs. Rotate the credential through the provider and update Supabase if it is exposed. Record the owner and rotation procedure in your organization's private operations system, not this repository.

## 3. Sending-domain DNS

Copy the exact DNS records issued for your provider account and sending domain. Do not copy another project's selector or a generic example key.

- **SPF:** authorize the provider for its specified envelope/return-path domain. If that host already has an SPF policy, merge authorized senders into one policy rather than publishing competing SPF records.
- **DKIM:** add the provider-issued selector/key records and wait until the provider reports verification. Use the requested TXT or CNAME type; do not substitute one.
- **DMARC:** publish a policy on the applicable `_dmarc` host with reporting to a mailbox/service you control. Begin with observation while checking alignment, then choose quarantine/reject once legitimate senders are accounted for. Do not enforce a policy blindly across an existing organization's mail domain.

Check received-message headers for SPF/DKIM/DMARC results and alignment with the visible From domain. Provider verification alone does not prove every recipient accepts the message. Maintain MX/return-path records when the provider requires them, and check DNS propagation before repeatedly changing configuration. Resend documents its domain-verification records and optional DMARC configuration in [Verified Domains](https://resend.com/docs/dashboard/domains/introduction).

## 4. Confirmation template and callback compatibility

Keep email confirmation enabled. The current signup flow provides `display_name` metadata and requests an email redirect to `/auth/callback`. The reviewed callback supports a PKCE `code`, or `token_hash` verified with `type: 'email'`, and redirects to the application home on success.

For a direct email-token confirmation template compatible with that existing token-hash branch, this is the link shape:

```html
<h2>Confirm your ChatAi account</h2>
<p>Use the link below to confirm your email address.</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}">Confirm email</a></p>
<p>If you did not request this account, you can ignore this message.</p>
```

Set Site URL to the canonical application origin before using this template. Alternatively, retain a provider template based on `{{ .ConfirmationURL }}` only after testing that its redirect/session flow reaches the application's code-exchange callback correctly. Do not combine two verification mechanisms into one URL. Supabase template variables such as `.SiteURL`, `.RedirectTo`, `.TokenHash`, and `.ConfirmationURL` have different meanings; check the generated email, not just the template preview. [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

Use a short, clearly labeled action and matching plain-text content where supported. Avoid embedding unescaped user metadata or promotional content. Ensure links remain intact through the email provider and mail-security gateway. PKCE code exchange may depend on the initiating browser's verifier cookie; test same-browser and cross-device confirmation deliberately. Do not log the full link or token to diagnose failures.

## 5. Password reset: implemented flow and delivery checks

The forgot-password form, recovery callback and authenticated `/reset-password` page are implemented. Generated-link integration tests verify callback/session handling and password changes without sending email. Actual SMTP inbox delivery remains a deployment check.

The implemented sequence to verify on the production deployment is:

1. Public reset-request form calls `auth.resetPasswordForEmail(email, {redirectTo: ...})` with a destination built from the canonical public origin. Use a neutral success message regardless of account existence.
2. Supabase sends its recovery template through the configured SMTP provider. Allowlist the implemented recovery/callback URL in Auth settings.
3. The callback establishes a recovery session using the appropriate code exchange or a validated recovery token type. It must not accept unrestricted external return URLs.
4. An authenticated update-password screen calls `auth.updateUser({password})`, reports errors without leaking tokens, and provides a clear completion/sign-in path.
5. Test expiry, link reuse, weak passwords, a missing browser verifier, and a second device. Verify the old password no longer signs in after a successful update.

The update route is `/reset-password`; the recovery email destination is `/auth/callback?type=recovery`. For token-hash templates, use `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`. This follows the two-stage request/update flow in [Supabase password-based Auth](https://supabase.com/docs/guides/auth/passwords).

## 6. Rate limits and abuse controls

There are independent controls: Supabase Auth's email/send and verification limits; resend cooldowns; the SMTP provider's recipient/sending quotas; and mailbox/provider reputation controls. The local `supabase/config.toml` is not evidence of the hosted project's effective settings.

Inspect the project's Auth rate-limit settings and provider account limits, then select values appropriate to expected signup/recovery traffic. Record the approved limits in your private deployment inventory. Custom SMTP does not mean unlimited mail. On rate-limit errors, respect cooldowns, show a retryable message, and avoid automatic resend loops. Apply the project's approved CAPTCHA/abuse controls to public Auth entry points if needed, while keeping email confirmation enabled. [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

## 7. Verification before public signup

Use real, controlled mailboxes rather than fictional test addresses. Verify both an organizational mailbox and a separate major mailbox provider.

- An unconfirmed account cannot sign in; the confirmation message arrives with the approved sender and no development URL.
- The action link establishes the intended user's session at the public HTTPS origin; refresh preserves it; sign-out clears it.
- Expired/reused links produce a safe retry path without displaying token contents.
- SPF, DKIM, and DMARC results are acceptable in received headers; messages are not unexpectedly rewritten by tracking.
- Recovery email and password update work end to end and cannot redirect outside the application allowlist.
- Provider delivery, bounce, suppression, and complaint records are observable by the operator; no credentials or token-bearing URLs enter public logs.

The existing callback integration script generates a verification link through the Auth admin API and follows it. That is useful callback/session evidence but **does not send or prove delivery of an SMTP message**. Keep generated-link checks and actual inbox verification separate.

## 8. Troubleshooting

| Symptom | Checks |
| --- | --- |
| Signup says success but no email | Check provider delivery/bounce/suppression logs, sender verification, recipient restrictions, spam folders, Auth limits, and whether the account is already confirmed. Do not disclose account existence in public UI. |
| SMTP authentication failure | Confirm host, TLS port, username convention, credential scope/rotation, and the selected provider account. An application login password is not necessarily an SMTP credential. |
| Timeout/TLS error | Check provider service status and documented TLS mode; validate host spelling and network reachability. Do not disable TLS checks. |
| Email arrives but link opens the wrong domain | Compare canonical application config, Supabase Site URL, redirect allowlist, template variables, and the deployed client bundle. Rebuild after public config changes. |
| Code exchange fails | Check callback route and initiating-browser cookie/verifier availability. Test a new request rather than reusing an expired code. |
| Token already used immediately | Check email link tracking and security scanners/prefetch. Disable click tracking; evaluate a deliberate user-confirmation step if scanners consume one-time links. |
| Reset email arrives but no password form | Check the recovery callback type, authenticated session and `/reset-password` destination; the application flow is implemented. |
| HTTP/Auth rate-limit error | Identify whether Auth, provider quota, or resend cooldown fired; back off and review configured limits instead of retrying in a loop. |
| Mail lands in spam | Inspect authentication/alignment headers, verified sender/domain reputation, bounce history, and provider restrictions. Do not solve it by removing confirmation. |

Use safe timestamps, provider message IDs, and redacted error categories for support. Never share passwords, API keys, session cookies, or full confirmation/recovery URLs. Deployment configuration and rollback procedures are in [DEPLOYMENT.md](DEPLOYMENT.md).
