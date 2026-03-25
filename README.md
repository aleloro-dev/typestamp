# Typestamp

Typestamp creates verifiable proofs of writing effort by recording every keystroke made during a writing session with precise timestamps.

These proofs are known as 'typestamps'.

## How it works

### The typestamp

When you write on Typestamp, every key press is captured with a precise timestamp. Once you save, the full keystroke log is compressed, encrypted, and stored. You get a link anyone can use to inspect it.

### The session

Sessions are event-based. Each session records a timeline of events: when it started, every key pressed, any pauses and resumes, and when it finished. This makes the audit trail transparent — a verifier can see not just what was typed, but the exact rhythm and flow of the writing.

### References

A reference scopes a typestamp to a specific purpose. An institution creates a reference with a label — for example, *Software Engineer Cover Letter Ford Q2 2026* — and shares the resulting link with writers. Any typestamp created through that link is permanently tied to that reference, which prevents the typestamp from being reused in a different context.

### Privacy and security

Keystroke data is encrypted with AES-256-GCM. The encryption key is derived from the typestamp ID and a server secret — neither is stored alone. Typestamps expire after 72 hours and are deleted automatically.

## Stack

- [Bun](https://bun.sh) + [Elysia](https://elysiajs.com)
- PostgreSQL
