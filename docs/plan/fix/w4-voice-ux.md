# Your task: W4 voice UX and accessibility (the /alexa simulator, Household panel, header, card)
Agent id: `w4-voice-ux`. Read `docs/council/reports/q4-frontend-ux.md` (all UX findings), `g1-voice-of-customer.md` (VOC-3,
VOC-6, VOC-8), `q1-security.md` (SEC-11), `g3-judge-spec.md` (JDG-5). Use the `make-interfaces-feel-better` mindset: small,
deliberate polish, no redesign. Keep the butter-on-ink look.

1. UX-5: the latency meter's "first speech" is measured only when audio actually starts (`onStart`), never from the ack
   text or the final event. If no audio played (muted, no TTS), say "text only" instead of a number.
2. UX-6: the caption keeps the acknowledgement on screen while it is spoken, then shows the answer.
3. UX-7 / VOC-8: pressing talk (or starting to listen) stops current speech (barge-in). Add a visible Stop control while
   Agora is speaking, also on the Escape key.
4. UX-8: when an approval arrives, the approval card gets `role="alertdialog"` with a label, focus moves to Approve, Escape
   rejects, and focus returns to the talk button afterwards. The card shows the full summary (steps or the fact to forget).
5. UX-9: read `event.error` in speech recognition: "Microphone blocked" (not-allowed), "Didn't catch that" (no-speech),
   network errors; release the hold button on pointer cancel/leave and on window blur.
6. UX-10 / UX-11 / UX-14: fix the failing contrast pairs the report lists (privacy/terms kicker, panel meta text, Delete,
   talk-button focus ring on cream); give Household and Voice header buttons `aria-label`s and visible text at desktop widths;
   document title "AGORA+ voice (unofficial Alexa+ simulator)"; hide the "dev-token" mode pill unless `?debug=1`; caption
   transitions respect reduced motion.
7. VOC-3 / SEC-11: Delete in the Household panel asks for confirmation inline ("Delete? Yes / No"); no browser `confirm()`.
8. Contract 1: show `who` (as a small name chip), `list` (group tasks: To-do, Shopping), and `dueAt` (local time) when present.
9. Contracts 5 and 6: proactive reminders and run completion announcements, with a quiet visual toast as well as speech.
   Do not announce anything on first load that was already due before the page opened more than 1 hour ago.
10. VOC-6 / JDG-5: wherever the UI cites Alexa's latency (the Spyglass line), show both dated facts: "up to 15 s (Spyglass,
    Sep 2025)" and "3-5 s for simple commands (The Verge, Oct 2026)", and frame our meter as "time to first audio".
11. UX-13: the Echo Show card (`server/mcp/apps/*`) shows an error state instead of "Loading…" forever when a tool call fails,
    and the speech line is a polite live region. Add a CSP meta tag that still allows the card to work.
12. Keep the suggestion chips; make sure "What is Mia allergic to?" and "Add milk to my shopping list" are among them.
13. Tests where logic is testable (pure helpers for the meter, approval words in the UI if any, reminder de-duplication).
    Run the gate. If you can, start the app on port 3200 to look at `/alexa` at 1024x768 and 390x844, then stop it.
