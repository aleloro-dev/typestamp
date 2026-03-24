# Typestamp

Typestamp creates verifiable proofs that a human wrote a piece of text by recording every keystroke made during the writing session.

## How it works

### The proof

When you write on Typestamp, every key press is captured with a precise timestamp. Paste is disabled — the only way to produce text is to type it character by character. Once you save, the full keystroke log is compressed, encrypted, and stored. You get a link anyone can use to inspect it.

### The session

Sessions are event-based. Each session records a timeline of events: when it started, every key pressed, any pauses and resumes, and when it finished. This makes the audit trail transparent — a verifier can see not just what was typed, but the exact rhythm and flow of the writing.

### References

A reference scopes a proof to a specific purpose. An institution creates a reference with a label — for example, *Software Engineer Cover Letter Ford Q2 2026* — and shares the resulting link with writers. Any proof created through that link is permanently tied to that reference, which prevents the proof from being reused in a different context.

### Privacy and security

Keystroke data is encrypted with AES-256-GCM. The encryption key is derived from the proof ID and a server secret — neither is stored alone. Proofs expire after 72 hours and are deleted automatically.

## Stack

- [Bun](https://bun.sh) + [Elysia](https://elysiajs.com)
- PostgreSQL
