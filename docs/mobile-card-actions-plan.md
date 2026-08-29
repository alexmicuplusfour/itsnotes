# Mobile note-card actions — plan

*Written 2026-08-30. Goal: give mobile a direct way to archive / pin / delete a single note
from its card, without reserving any space on the card.*

**Status: built 2026-08-30, not yet verified on a device.** Client builds clean and 44 client
tests pass (38 existing + 6 new for the shared action list), but the behavior itself is a
touch gesture — it needs a real phone. See "Verification" for what to check.

## What this is

The app's first outside user asked for note-card actions on mobile, revealed by swiping a
card. Desktop has had them on hover forever; mobile had no per-card route to them.

This landed as **long-press**, not swipe, and the reasoning is worth keeping — see the two
sections below. Long-press on a card now opens a small pill of actions floating over the
card's bottom-right corner, and simultaneously reveals the selection checkbox. It no longer
selects the note outright.

## What mobile was actually missing

The deep dive corrected the premise. Mobile wasn't missing the actions: long-press already
selected the note, and selection swaps the New Note button for a floating pill
(`Header.jsx` lines 2050–2110) carrying tag, color, archive, trash, plus download and
copy-reference in an overflow. That's one gesture away and thumb-reachable.

What was actually missing was narrower:

- **Pin** — the only card action with no mobile route at all; it isn't in the selection pill.
- **Discoverability** — nothing hints long-press exists, which is why the request arrived as
  "add swipe". Worth noting the selection checkbox was *invisible on mobile until something
  was already selected*, so the multi-select affordance never announced itself either.

So the win here isn't unlocking actions, it's giving each surface one job:
**long-press = act on this note** (card strip) and **tap the checkbox = select notes**
(bulk pill).

## Why not swipe

Swipe was designed in full and abandoned for a concrete reason: it can't be made
unconditional without breaking something.

Blocking the competing page scroll needs either `touch-action: pan-y` on the card or
`preventDefault` in a touch handler. `touch-action` **intersects down the ancestor chain** —
a descendant can only restrict panning further, never re-enable it — so `pan-y` on a card
kills horizontal scrolling in the thumbnail strip inside it (`ImageGallery.jsx` line 19,
`overflow-x: auto` at 2+ images). And `preventDefault` doesn't work from React's `onTouchMove`,
which is registered passively; getting it requires a native non-passive listener, which then
takes over horizontal panning inside cards *everywhere* — killing that same strip scroll by a
different route.

Every remaining option was a per-card or per-target exception ("this card swipes, that one
doesn't"), which is precisely the kind of inconsistency that reads as a bug. Long-press has
no such conflict: it competes with nothing, needs no axis lock, no non-passive listeners, no
`touch-action`, and leaves the gallery completely alone.

## What it costs

Starting a multi-select is one tap slower: long-press → tap the checkbox → then tap the rest,
where before the long-press selected immediately. Partly repaid by the checkbox now being
visible at that moment rather than hidden. Single-note actions — the common case — get
strictly better: they land on the card you pressed instead of in a pill at the bottom of the
screen, and pin joins them.

Once selection mode *is* running, long-press keeps its old meaning (toggle selection), so
adding notes to a selection is unchanged.

## What was built

Mostly `client/src/components/NoteCard.jsx`, plus a small shared helper in `utils/`.

### 1. Mobile breakpoint fix

Initial `isMobile` used `<= 768` while the resize handler and the card's own CSS both use
600, so a window first painted between 601–768px was treated as mobile until the user
resized. Now 600 everywhere. The new strip keys off this flag, so it had to be right.

### 2. Shared action list

`client/src/utils/noteCardActions.js` — `buildNoteStateActions({ note, view, actions })`
returns the state-changing actions as data: archive/unarchive, pin/unpin, trash, or restore +
delete-forever in trash, in the same order and under the same conditions the desktop bar used
inline. `actions` is the memoized `NoteActionsContext` value, so the call allocates nothing
extra. The desktop hover bar renders its color and tag buttons then maps this list; the mobile
strip maps it alone. Behavior-neutral for desktop, and the two surfaces can no longer drift as
actions change.

Both call sites invoke it directly in the branch that renders, rather than memoizing it per
card: the bar only exists on the hovered card and the strip only on the long-pressed one, so a
`useMemo` would have charged all several-hundred mounted cards a dependency check per render
to produce a value all but one of them discards.

It lives in `utils/` rather than inside the component because it's the only real logic in this
change and it now drives two surfaces at once — a regression would break both silently. Six
tests in `noteCardActions.test.js` pin the per-view sets, the pinned/unpinned icon flip, and
that each `run()` reaches the right handler, matching the repo's convention of testing pure
helpers.

### 3. The strip

`MobileActionStrip` — absolutely positioned at the card's bottom-right (inset 6px), 24px
radius, 40×40 touch targets, `color-mix` card-colored background at 88% with
`backdrop-filter: blur(10px)`, matching the note form's floating mobile bar. Hidden under the
existing `.selection-mode` rule, exactly like the desktop bar. Mounted only while open, so
idle cards carry no extra DOM.

Three 40px targets ≈ 132px; the narrowest realistic card (320px phone, 2-column grid) is
≈148px, so it fits.

### 4. Trigger and dismissal

`handleLongPress` (still `onContextMenu`, see below) branches: on mobile outside selection
mode it opens the strip, dispatches a `note-actions-opened` window event, and vibrates 20ms;
otherwise it falls through to the original select-the-note behavior.

Dismissal: tapping an action; tapping the card (which does **not** open the note); scrolling;
a pointer landing outside the card. "Only one strip open at a time" needs no machinery of its
own — a long press on another card necessarily begins with a pointerdown outside this one, so
the outside-pointer listener already closes it.

A 400ms settling window (`STRIP_SETTLE_MS`) guards the tap and scroll paths: the long press
that opens the strip can be followed by a stray click or a small settling scroll as the finger
lifts, which would otherwise close it instantly. The outside-pointer path needs no such guard —
the finger that fired `contextmenu` is inside the card by definition.

### 5. The checkbox

Now also visible while the strip is open, and tapping it closes the strip and enters
selection mode.

### 6. List layout gets the same mechanism

`ListViewItem` had the identical gap — its `HoverActions` are `display: none` under 768px, so
long press → select → bulk pill was the only route there too. It now uses the same hook and
the same strip component: long press opens the strip, the row's checkbox appears with it, and
selection mode keeps its old long-press meaning once running. `ListView` passes its existing
`isMobile` down (one resize listener for the whole list rather than one per row), and it's
added to the row's memo comparator.

Sharing meant extracting two pieces out of `NoteCard`:

- `client/src/hooks/useMobileActionStrip.js` — open/close state, the settling window, and the
  dismissal listeners, bound to whatever container ref it's given. It exposes `dismissOnTap()`
  rather than the settling window itself, so hosts write `if (dismissOnTap()) return;` in their
  own tap handler and never have to know the concept.
- `client/src/components/MobileNoteActionStrip.jsx` — the pill itself. Its background reads
  `var(--card-bg-color, var(--item-bg-color, var(--mobile-background-color)))`, so it picks up
  a colored note in either host without either host knowing about the other.

`ListView` also had to start setting the `selection-mode` class on its container. The strip
hides itself during bulk selection with a `.selection-mode &` rule — the same mechanism the
desktop bars use, and the reason it's CSS rather than a prop is that neither host re-renders
when selection mode changes. `NotesList` set that class; `ListView` never did, so the rule was
silently dead on list rows.

While there, the row's desktop hover bar was migrated onto `buildNoteStateActions` too —
otherwise the same component would render the same action set two different ways. That closes
the third copy the helper was written for. **One visible desktop change:** list rows used to
show pin before archive; they now match the card's archive-then-pin order.

That migration made six props redundant: `ListView` was destructuring `archiveNote`,
`unarchiveNote`, `togglePin`, `trashNote`, `restoreNote` and `deleteNote` from
`NoteActionsContext` only to hand them to rows under `on*` names, which the row then mapped
back. Rows already call `useNoteActions()` for their prefetch primitives, so they now read the
handlers there directly and the round trip is gone.

### 7. Dead code removed while in here

`showActions` state and the `className={showActions && !isMobile ? 'active' : ''}` it fed:
no `.active` rule has ever existed on `Card`, and the state was never reset to false. Also
`isNoteArchived` / `isNoteDeleted` in both components, whose only remaining consumers were the
inline action buttons this change replaced (`buildNoteStateActions` derives both from `note`),
the six action handlers `NoteCard` no longer destructures individually, and `ListViewItem`'s
five per-action `useCallback` wrappers.

## Known caveat: the `contextmenu` trigger

Long-press is detected via `contextmenu`, which is what the code already used. Its reliability
on touch varies by browser — iOS Safari in particular is inconsistent for plain elements. It's
possible the original "can you add swipe" request was really "long-press does nothing on my
phone", in which case moving more functionality onto the same trigger inherits the problem.

Kept as-is deliberately, pending feedback from the user who asked. If it turns out to misfire,
the fix is a manual long-press timer (~450ms, cancelled if the finger moves >10px) on
touchstart/touchend, which behaves identically everywhere. It needs no `preventDefault`, so it
stays passive and can't affect scrolling — the swipe conflict does not come back with it.

## Deliberately out of scope

- **No swipe**, for the reasons above.
- **Color and tag stay off the mobile strip** in both layouts, as requested; both remain
  reachable on mobile through the selection pill.
- **No settings toggle.** The strip is additive and dismissible.

## Demo mode

The card's actions have never been demo-gated: `NoteCard` doesn't know about `isDemoMode` at
all, while the bulk selection pill disables archive / trash / delete-forever for demo users
(`Header.jsx` lines 2083–2104). On desktop that gap already existed — a demo visitor could
always archive from the hover bar. This change extends the same ungated path to mobile, where
previously the only route was the gated pill.

It's cosmetic either way (the gating is client-side only; the server doesn't enforce it and the
demo resets on a timer), so nothing was changed here. If it should be closed, the fix belongs
on `buildNoteStateActions` so desktop and mobile are covered together.

## Verification

1. `cd client && npm test` — 44 tests pass. `npx vite build` — clean. *(Done.)*
2. **On a real phone** (emulated touch won't reproduce long-press or momentum scrolling):
   long-press a card → pill appears bottom-right, checkbox appears top-left, note is **not**
   selected and does **not** open.
3. The image gallery still scrolls horizontally on multi-image cards — the whole reason
   swipe was dropped.
4. Each action works; archive and trash show their existing Undo toast; pin flips the icon.
5. Per view: main (archive/pin/trash), archive (unarchive/pin/trash), trash
   (pin/restore/delete-forever), and search results.
5b. **List layout**, same checks: long press a row → strip appears bottom-right, checkbox
   appears, row does not open. Desktop list rows still show their full hover bar, now with
   archive before pin.
6. Dismissal: tap the card → strip closes and the note does not open; scroll → closes;
   long-press a second card → the first closes; tap outside → closes.
7. Tap the checkbox → selection mode starts, strip disappears, bulk pill appears at the
   bottom; long-press another card then still toggles selection.
8. Card shapes: an 80px one-liner, a tall image note, a colored note (pill picks up the
   colour), pinned notes, both grid and stacked layouts.
9. Desktop unchanged: hover bar identical (same buttons, same order), right-click still
   selects, and a window sized 601–768px now shows the desktop bar immediately.

## Scope

Modified: `client/src/components/NoteCard.jsx`, `ListViewItem.jsx`, `ListView.jsx`.
New: `client/src/hooks/useMobileActionStrip.js`,
`client/src/components/MobileNoteActionStrip.jsx`,
`client/src/utils/noteCardActions.js` + `noteCardActions.test.js`.
