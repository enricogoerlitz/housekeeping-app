# Dependencies and supply chain

A real attack surface, not a theoretical one: a backdoored release of a widely used AI gateway
package sat on the public index for three hours in March 2026 and was pulled roughly 47,000 times.
Nothing in the code being reviewed would have shown it. What catches this is discipline about what
gets added and when versions move.

## A new dependency

- Is there one line of justification: what it does, and why it beats the alternatives and beats
  writing it?
- How much does it pull in transitively? A one-function utility with forty dependencies is not a
  small addition.
- Is it maintained — recent releases, more than one maintainer, an issue tracker that gets answers?
- Does the name resemble a more popular package? Typosquatting relies on a glance being enough.
- Was it published very recently, or did it just change maintainer? Both are moments of elevated
  risk.
- Does it run scripts at install time? That code executes on every developer machine and in CI.

## A version bump

- Never blind. Read the changelog between the versions and check for known advisories.
- A jump across a major version is a change in behaviour, not a maintenance task — it needs tests.
- A lock file changed without the manifest changing deserves an explanation.
- A transitive dependency that moved a long way in one bump is worth a look.

## Lock files and integrity

- The lock file is committed and never hand-edited.
- Integrity hashes present and unchanged for versions that did not change.
- The build resolves from the lock file, not from ranges, in CI and in release builds.
- Private and public registries not mixed in a way that lets a public package shadow an internal
  one (dependency confusion).

## The build itself

- CI workflows pinned to a commit or a version, not a moving tag.
- A build step that downloads and executes something from the network is code you did not review.
- Container base images pinned by digest where it matters.
- Secrets in CI scoped to the job that needs them, not available to every pull request build.

## What to report

Report the discipline problem, not a vulnerability count. "Version bumped with no changelog check
and no test change" is actionable. "This package has 3 medium advisories" without reachability is
noise — check whether the vulnerable path is actually used before raising severity.
