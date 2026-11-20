# Access control

The most common serious finding in real applications, and the one that automated tools find least
often — because it needs to know the intent.

## Missing checks

- A new endpoint with no authorisation rule. Check whether the framework's default is open or
  closed; if open, every route needs an explicit rule.
- Authorisation done in the UI only — a hidden button is not a control.
- A check on the read path but not the write path, or on the collection endpoint but not the
  single-item one.
- Background jobs, webhooks, admin endpoints, health and debug routes, GraphQL resolvers, batch
  and bulk operations — all frequently forgotten.

## Insecure direct object references

The core question for every lookup: **does the authenticated principal own or have access to
this identifier?**

- `findById(req.params.id)` with no ownership condition in the query.
- Ownership checked after the object was already returned or acted upon.
- Sequential identifiers making enumeration trivial. Not a control by themselves, but they turn a
  missing check into a mass extraction.
- Nested resources where the parent is checked but the child is not — the child may belong to a
  different parent.

## Multi-tenancy

- A query without a tenant condition. Prefer enforcement the developer cannot forget: a scoped
  repository, a row-level policy, a mandatory filter in the data layer.
- A tenant identifier taken from the request rather than from the session.
- Caches, search indexes, exports and reports that were built without the tenant condition.

## Privilege and roles

- Role or permission taken from a request field, a JWT claim the client can set, or a cookie the
  client can edit.
- Privilege escalation through mass assignment: a request body that can set `role`, `isAdmin`,
  `tenantId`, `ownerId`.
- "Verify then use" gaps — the check reads one record and the action writes another.
- Impersonation or support access with no audit trail.

## Function-level checks

- Authorisation logic scattered across handlers drifts apart. One place, applied uniformly, is
  both safer and reviewable.
- Deny by default. A route with no matching rule should fail closed, not open.
