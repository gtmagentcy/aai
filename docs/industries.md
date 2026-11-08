# AAI by industry

Every product people use through a screen will be used through an agent too. Six sketches of what
that could look like: the prompt, what the agent does, and what the business would have to
publish. They are thought experiments, not descriptions of any real company.

| Industry | The prompt | What the agent does | What they'd publish |
|---|---|---|---|
| Airline | "Move me to an earlier flight home on Friday. Aisle seat, keep my upgrade." | `search_flights`, `change_booking` | Booking-change and seat-map tools; anything that costs money waits for a yes |
| Open-world video game | "Which side missions near the coast haven't I done? Set a waypoint to the closest." | `get_progress` on the player's own save, `set_waypoint` | Read access to the player's save, with consent; agents never play online matches or touch the in-game wallet |
| Hotel | "Two nights near the venue, late checkout, pay at the hotel." | `availability`, `hold_room` | Live rates and a room hold with no account; the cancellation policy in plain words |
| Clinic | "A dermatology appointment this week my insurance covers. Mornings only." | `check_coverage`, `book_slot` | Open slots and coverage checks; no medical advice; health details stay with the patient |
| Bank | "Open a business account for my new company and get me to the ID check." | `prefill_application`, `start_kyc_handoff` | A prefill tool and the documents list; identity checks and money movement are the person's alone |
| City hall | "Renew my parking permit and tell me when it arrives." | `renew_permit`, `subscribe_status` | A renewal form an agent can submit and a status feed, instead of a portal login |

Add yours: open a pull request with a row, or a full flow for the chat component.
