# Good Rally: founding cohort test plan

**The question this test answers:** will people (mostly 55+) stick with a daily AI-for-health habit for 30 days, and will they pay for it?

## The rules (decided now, so the data decides later)

| | Target | If we miss it |
|---|---|---|
| Waitlist sign-ups in 14 days | **100** | Positioning or channel problem: rewrite the pitch once, retry for 7 days, then stop |
| Founding members who start | **30** | |
| Still replying on day 14 | **≥ 50%** | The daily format is too much: test 3× a week |
| Finish day 30 | **≥ 30%** | |
| Pay for more (weekly membership or next cohort) | **≥ 10 people** | Stop, or keep it as a free audience-builder for the Substack |

**Deadline:** launch the waitlist within 7 days. First message goes out 14 days after that.

## Pricing for the test
- **Founding cohort: $29 for the 30 days**, with a full refund if it's not for you by day 7. Keep the guarantee instinct from ISO.
- If paid sign-ups are slow, run the first cohort free for 30 people and test payment on the *next* step (weekly membership, $9/month) instead. Either way, **someone must be asked to pay** before this counts as validated.
- Create one Stripe Payment Link and put it in the `STRIPE_LINK` secret. The site then shows "Lock in founding price" after sign-up.

## Running the 30 days (founding cohort, ≤50 people)
Keep it manual. Automation comes after it works.
- **Email members:** schedule the 30 emails in advance in your email tool (Substack, Mailchimp or similar) with `{name}` merge fields.
- **WhatsApp members:** a WhatsApp Business broadcast list. Replies come to you one-to-one.
- **Text members:** a simple business texting service, or send from WhatsApp Business if they're happy to switch.
- Block 20 minutes each morning to read replies and answer HELPs. **The replies are the product research.** Keep a note of every question and every place people got stuck.
- Track in a sheet: member · channel · last day replied · HELP count · would pay (Y/N).

## Privacy & safety guardrails
- Collect only what the form asks. **Never ask members to send medical records, test results or medication names to you.**
- Every health-information day carries the "AI is a helper, not a doctor" line.
- If a member describes an emergency in a reply, respond immediately with "please call 911 or your doctor now". Don't give advice.
- Before charging, add a short privacy policy and terms page (what you collect, how to unsubscribe, the refund promise).

## Where the first 100 come from
1. **Your Substack (the perennial report).** Your readers already care about movement, recovery and women's health. Best channel.
2. **Adult children.** "Sign up your mum" is a strong angle. The form has a "signing up for a parent" box.
3. **Facebook.** Where the 55+ audience actually is: local community groups, retirement and caregiving groups (post only where self-promotion is allowed).
4. **Clinics, physical therapists, senior centres and libraries.** A printed flyer with a QR code; libraries often run tech-help sessions.
5. **Threads/Instagram.** Aim these at the adult-children angle rather than at older adults directly.

---

## Ready-to-post copy

### Substack note
> I'm starting something new: **Good Rally**, a 30-day club for using AI to take better care of your health.
>
> One short message a day. Five minutes. Things like: getting ready for a doctor's visit so you don't forget your questions, turning what's in your fridge into a heart-healthy dinner, a gentle movement routine that fits *your* body, and spotting the AI scams that target people our parents' age.
>
> No tech skills needed, and always with the rule: AI is your helper, never your doctor.
>
> I'm opening it to a small founding group first → goodrally.club

### Threads / Instagram
> Your parents have heard of AI. They've never found a reason to use it.
>
> So I made one: Good Rally, a 30-day club. One text a day, five minutes, all about their health: appointment prep, medication lists, dinner from the fridge, spotting scams.
>
> Sign them up (or do it together) → goodrally.club

### Facebook (community groups, where allowed)
> Has anyone else been curious about AI but not sure where to start? I'm running a free/low-cost 30-day "club" where you get one short message a day showing a simple way to use it for your health, like preparing questions for a doctor's visit or planning an easy healthy dinner. It's written for people who don't consider themselves "tech people". Happy to answer any questions here! goodrally.club

### Personal email (to friends and family)
> Subject: Would you (or your mum) try this?
>
> Hi [name], I'm testing a small project called Good Rally: a 30-day club where you get one short message a day showing how to use AI for your health (appointment prep, meals, movement, avoiding scams). It's made for people who aren't techy.
>
> Would you, or someone in your family, be up for trying it? It'd genuinely help me to hear what works. → goodrally.club
