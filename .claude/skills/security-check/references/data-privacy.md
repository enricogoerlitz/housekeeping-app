# Data and privacy

Not a compliance checklist — the handful of things that go wrong in code.

## Collection

- A new field holding personal data: name, address, birth date, phone, email, IP address, device
  identifier, location, health or financial data, photograph.
- Is it needed for the feature, or is it being collected because it was available? Ask.
- Free-text fields end up holding whatever users type. Treat them as personal data.

## Logging — where most leaks happen

- Full request bodies on authenticated endpoints.
- Full response payloads, especially from list and export endpoints.
- Query parameters (they carry tokens and identifiers), full URLs, referrer headers.
- Exception objects that stringify the whole context, including arguments.
- Personal data in an error message that reaches an external monitoring service.
- Debug logging enabled in a production configuration.

The test: could this log line be pasted into a ticket without redaction?

## Storage and transport

- Personal data in a cache, a search index, a queue, a temporary file or a test fixture — all
  easy to forget, all real copies.
- A production dump used as test data. If it happens, it must be anonymised, and "removed the
  name column" is not anonymisation.
- Encryption at rest where the project requires it; TLS in transit always.
- An export or report endpoint that returns more fields than the screen shows.

## Retention and deletion

- Deletion has to reach derived stores: search index, cache, queue, analytics, exports, audit
  copies, and backups within their own policy.
- Soft delete is not deletion. If the record stays, say so and note where.
- Is there a retention rule at all, or does data accumulate by default?

## Sharing

- Data sent to an external service — analytics, monitoring, a model provider, a support tool.
  Which fields, and is that intended?
- A third-party script on a page that carries personal data can read all of it.
- Personal data in a URL reaches the browser history, the server log and the referrer header of
  the next request.
