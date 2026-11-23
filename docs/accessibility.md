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
- **Announcements:** points earned, right or wrong, the Sym's pick and the battle score are announced through one
  polite `aria-live` region. Loading states ("your Sym is thinking") are announced too.
- **Motion (changed 2026-11-23):** motion now starts ON for everyone, and the Motion switch in the footer turns it off (the choice is kept). Until this date the game started still when the device asked for reduced motion. This is a known gap against WCAG 2.3.3: a person who asked their device for less motion sees the opening once before they can turn it off. Nothing flashes, any tap or key ends the opening, and Skip is there from the first frame. Small CSS effects still follow the device setting. The earlier rule read: with the device setting for reduced motion on, nothing moves and the Sym is one still picture,
  redrawn when the Sym changes. A "Motion" switch under the Sym lets the player turn movement on or off; their
  choice is kept in the browser and wins over the device setting in both directions. Nothing flashes.
- **Color (BYT house style, second pass, 2026-11-14: infinite black, a lit horizon, sharp lines, platinum for
  structure, gold for what is active or earned):** backdrop `#010206`, text `#f5f7fb`, muted text `#a9b1c4`, labels
  `#c6cede`, gold `#ffd98a`, dark ink on the light button, control borders about 4:1. These pairs are estimated
  from the first pass and not yet measured. Lettering filled with a light gradient falls back to a plain color
  under forced colors. Right and wrong carry an icon and a word, never color alone.
- **The Sym** is a canvas: a sphere of connected points, one colored slice for each area. It has a text
  alternative that states how formed it is. Color is never the only signal: a legend under it names each area with
  its number, and each legend entry is a button that opens the same view a tap on a dot does, so the sphere can be
  used by keyboard and screen reader. Pointing at a dot shows its area and state in words.
- **Time:** "Play my story" has a button and a slider with a spoken value for each moment.
- **Short screens:** the longer explanation sits behind a "More" button that opens on hover, on focus and on tap,
  and closes with Escape.
- **Plain words:** every word a player reads is fifth-grade plain English with no idioms, slang or contractions.
- **Layout:** one column on a phone, usable at 320px wide with no horizontal scroll, and at 200% zoom. From 1000px
  wide the Sym holds the left and the content the right. The phone layout and the zoom are not yet checked in the
  second-pass style; on a phone the legend and the story control are hidden, and the Areas tab gives the same content.
- **Screens of every size:** from 1000px wide, two columns. Below that, one column with the menu fixed at the bottom
  and safe-area padding for notched screens; no sideways scroll at 390px wide (checked in a 390 by 800 frame; the
  legend strip scrolls sideways inside itself by design). Glance mode (`?view=glance`, or automatic when the screen
  is under 430px tall or 300px wide) and Wall mode (`?view=wall`) show the sphere and a few large numbers, with one
  button back to the full view. Not yet checked on a real phone, with a screen reader, or at 320px.
- **Two looks:** Mono (white on black, no glow) and Light. Mono muted text `#9a9ea8` on `#000000` is estimated at
  about 7:1 and not yet measured.
- **Drawings** (cards, avatar, wardrobe) are inline SVG with a text alternative, or marked decorative when the label already says it.

## Checklist (ticked when verified, with how)

Status on 2026-11-23. Checked: the page has `lang="en"` and a descriptive title (read in `frontend/index.html`); 13 menu screens of the three seats were measured by script at 16 phone sizes from 344 to 448 wide, with no sideways scroll from 620 high; the Motion switch turns the moving scenes off. Not done yet, and the report says so: a keyboard-only pass, a screen reader pass with NVDA, measured contrast for every pair, and 320px. The boxes below stay unticked until each is checked.

### Structure
- [ ] One `h1` per screen, headings in order; `header`, `main`, `nav`, `footer` landmarks
- [ ] Buttons are `<button>`, links are `<a>`
- [x] Descriptive `<title>`, `lang="en"` (read in `frontend/index.html`, 2026-11-23)

### Keyboard
- [ ] Every gate playable start to finish by keyboard
- [ ] Visible focus ring on every control
- [ ] No traps; dialogs and toasts can be dismissed with Escape

### Visual
- [ ] Contrast checked for every text and border pair, results recorded below
- [ ] Meaning never by color alone
- [ ] 320px wide and 200% zoom checked
- [ ] Reduced motion respected (not by default since 2026-11-23: the Motion switch turns it off); nothing flashes

### Labels and announcements
- [ ] Nickname field has a visible label; it is the only text field in the app
- [ ] Board cells and icon-only controls have `aria-label`; selected states use `aria-pressed`
- [ ] Results and loading announced through `aria-live`

### Verification
- Keyboard-only pass done on:
- Screen reader pass (NVDA) done on:
- Contrast checks (tool and results):

## 2026-11-18: no scrolling on a wide window

- On a window at least 1000 px wide and 600 px tall, the page does not scroll. Each screen's content is laid out in
  pages as tall as the space left, and Back and More buttons turn the page (`frontend/src/Pages.tsx`). The page
  count is announced ("Page 2 of 3") through a polite live region.
- Keyboard: Tab moves through everything in reading order. Moving focus into something on a later page turns to
  that page by itself, so nothing is unreachable. Back and More are ordinary buttons.
- Motion: with Motion off, a page turn is instant, not a slide.
- A narrow window (a phone) keeps the ordinary page that flows downward; nothing changes there.
- Zoom: at 200 percent on a small laptop the window falls under the size above and the ordinary page returns.
- Not yet checked: a screen reader pass over the paged screens, and the pop-outs with a keyboard only.

## 2026-11-22: a phone, and results that move on

- **No scrolling at phone size.** The paging rule (Back, "Page n of m", Next) now applies to phones. Checked at 428 by 740 and 375 by 640 in a phone-sized frame, on every seat. Tap targets in the phone layout are at least 40 px tall; the seat switcher went from 26 px to 40 px.
- **Timing (WCAG 2.2.1).** With motion on, a card's result shows for about one second and the next card arrives by itself. This is tied to the game's Motion switch: with Motion off, or when the device asks for reduced motion and the switch was never touched, there is no timer and the result waits for the Next card button. A tap anywhere on the card ends the wait early.
- **Not color alone.** The Sym's guess is marked by a tag with the word "Sym" on the tile, a right answer by a check mark and its points, a wrong one by a dashed border. In the plain look, which has no glow, the picked tile is filled.
- **Screen readers.** The Sym's line in a gate is a polite live region and no longer types itself out letter by letter. The spoken announcements after each answer are unchanged. The page title of a finished gate is kept for screen readers and hidden from sight.
- **Touch.** A tile no longer keeps its hover look after a tap, so the next card does not seem to have an answer chosen.
- **Still open:** a pass with a screen reader on a real phone, and keyboard-only play of the new result beat, have not been done.
