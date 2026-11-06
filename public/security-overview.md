# Security and Compliance Overview

## Architecture and tenant isolation

CiteMend authenticates user sessions with Clerk and stores workspace ownership alongside each customer record. Server routes use the Clerk session or a scoped, hashed workspace API key and constrain reads and writes to that user and workspace. API keys are displayed once, stored as SHA-256 hashes, scoped to read permissions, and can be revoked. Clerk Organization roles map to owner, admin, editor, and viewer permissions. SSO and MFA are supported when enabled in the customer's Clerk organization configuration; availability depends on the configured Clerk plan and identity provider.

## Network and webhook security

Public URL checks use DNS-pinned connections and reject non-public IP answers, private/loopback destinations, non-HTTP protocols, credentials, and nonstandard ports. Redirects are followed explicitly with a bounded hop count so every destination is validated again. Shopify Admin calls use the connected store's fixed `myshopify.com` hostname and encrypted access tokens. Lemon Squeezy webhook deliveries are signature-verified and deduplicated before processing.

## Data protection

Application traffic uses HTTPS. Database and hosting encryption at rest are provided by the configured infrastructure vendors; CiteMend does not claim independent key custody for vendor-managed storage. Shopify credentials are encrypted with AES-256-GCM before persistence. API keys are stored only as hashes. Access to evidence tables is server-side and protected by ownership filters and database row-level security.

## Retention, export, and deletion

Workspace owners can set observation retention to 90, 180, or 365 days. The retention worker at `/api/cron/data-retention` must be invoked by an operator-configured scheduler using `CRON_SECRET`; its run removes expired observations and citation-change events. Export provides a workspace-scoped JSON archive. Workspace deletion removes scoped application records and writes an append-only audit event. Deletion from infrastructure backups follows the hosting provider's backup lifecycle; CiteMend does not promise immediate physical erasure from backups. Configure and publish your operational deletion service level before making contractual commitments.

## Incident response

On suspected compromise: revoke affected API keys and integration tokens, contain access, preserve relevant audit logs, assess affected workspaces, notify affected customers and authorities when required by applicable law, remediate and rotate credentials, then document the incident and corrective actions. This describes the intended response process; it is not a certification or guarantee of a particular notification deadline.

## Procurement notes

This document describes implemented application controls and infrastructure-dependent controls. It does not represent SOC 2, ISO 27001, HIPAA, or other third-party certification. Organization membership synchronization and SSO/MFA depend on Clerk tenant configuration.
