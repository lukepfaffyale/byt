# Accessibility plan and checklist (WCAG 2.1 AA)

Written 2026-11-14, before any screen. A tap-only game on a phone still has to work by keyboard and screen reader.

## Design rules for this game

- **Every tap target is a `<button>`,** at least 44 by 44 CSS pixels, with a text label. Cards are never click
  handlers on a `div`, and nothing depends on a swipe gesture: a swipe is only a shortcut for the two buttons.
- **Keyboard:** left and right arrow keys (and 1, 2, 3) pick an option; Enter and Space activate; Tab order follows
  the screen. Focus moves to the next card's prompt after each pick.
- **Game boards** (tic-tac-toe, connect four) are grids of buttons. Each cell has an `aria-label` such as
  "row 2, column 3, empty" or "row 1, column 1, X". Marks differ by shape (X and O, filled and ringed), never by color alone.
- **Reflex gate:** the signal changes shape and text as well as color, with one calm change (no flashing, no
  strobing). Space or Enter works as the tap. A player can skip the reflex gate with no penalty to the journey; the
  reflex cert is the only thing skipped. Timing is never required anywhere else.
- **No time limits** on preference, strategy or logic cards. Time is recorded, never enforced.
- **Announcements:** points earned, right or wrong, the twin's pick and the battle score are announced through one
  polite `aria-live` region. Loading states ("your twin is thinking") are announced too.
- **Motion:** with the device setting for reduced motion on, nothing moves and the twin is one still picture,
  redrawn when the twin changes. A "Motion" switch under the twin lets the player turn movement on or off; their
  choice is kept in the browser and wins over the device setting in both directions. Nothing flashes.
- **Color (BYT house style, second pass, 2026-11-14: infinite black, a lit horizon, sharp lines, platinum for
  structure, gold for what is active or earned):** backdrop `#010206`, text `#f5f7fb`, muted text `#a9b1c4`, labels
  `#c6cede`, gold `#ffd98a`, dark ink on the light button, control borders about 4:1. These pairs are estimated
  from the first pass and not yet measured. Lettering filled with a light gradient falls back to a plain color
  under forced colors. Right and wrong carry an icon and a word, never color alone.
- **The twin** is a canvas: a sphere of connected points, one colored slice for each area. It has a text
  alternative that states how formed it is. Color is never the only signal: a legend under it names each area with
  its number, and each legend entry is a button that opens the same view a tap on a dot does, so the sphere can be
  used by keyboard and screen reader. Pointing at a dot shows its area and state in words.
- **Time:** "Play my story" has a button and a slider with a spoken value for each moment.
- **Short screens:** the longer explanation sits behind a "More" button that opens on hover, on focus and on tap,
  and closes with Escape.
- **Plain words:** every word a player reads is fifth-grade plain English with no idioms, slang or contractions.
- **Layout:** one column on a phone, usable at 320px wide with no horizontal scroll, and at 200% zoom. From 1000px
  wide the twin holds the left and the content the right. The phone layout and the zoom are not yet checked in the
  second-pass style; on a phone the legend and the story control are hidden, and the Brain tab gives the same content.
- **Screens of every size:** from 1000px wide, two columns. Below that, one column with the menu fixed at the bottom
  and safe-area padding for notched screens; no sideways scroll at 390px wide (checked in a 390 by 800 frame; the
  legend strip scrolls sideways inside itself by design). Glance mode (`?view=glance`, or automatic when the screen
  is under 430px tall or 300px wide) and Wall mode (`?view=wall`) show the sphere and a few large numbers, with one
  button back to the full view. Not yet checked on a real phone, with a screen reader, or at 320px.
- **Two looks:** Mono (white on black, no glow) and Light. Mono muted text `#9a9ea8` on `#000000` is estimated at
  about 7:1 and not yet measured.
- **Drawings** (cards, avatar, wardrobe) are inline SVG with a text alternative, or marked decorative when the label already says it.

## Checklist (ticked when verified, with how)

### Structure
- [ ] One `h1` per screen, headings in order; `header`, `main`, `nav`, `footer` landmarks
- [ ] Buttons are `<button>`, links are `<a>`
- [ ] Descriptive `<title>`, `lang="en"`

### Keyboard
- [ ] Every gate playable start to finish by keyboard
- [ ] Visible focus ring on every control
- [ ] No traps; dialogs and toasts can be dismissed with Escape

### Visual
- [ ] Contrast checked for every text and border pair, results recorded below
- [ ] Meaning never by color alone
- [ ] 320px wide and 200% zoom checked
- [ ] Reduced motion respected; nothing flashes

### Labels and announcements
- [ ] Nickname field has a visible label; it is the only text field in the app
- [ ] Board cells and icon-only controls have `aria-label`; selected states use `aria-pressed`
- [ ] Results and loading announced through `aria-live`

### Verification
- Keyboard-only pass done on:
- Screen reader pass (NVDA) done on:
- Contrast checks (tool and results):
