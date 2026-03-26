# Design System Document

## 1. Overview & Creative North Star: "The Kinetic Arena"
This design system is engineered to transform a classic logic game into a high-stakes, vibrant multiplayer experience. Moving away from static, grid-bound layouts, we embrace **The Kinetic Arena**—a philosophy that treats the UI as a living, breathing field of play. 

The aesthetic breaks the "template" look by utilizing intentional asymmetry, overlapping card elements, and a radical rejection of traditional borders. We rely on **Tonal Depth** and **Atmospheric Layering** to guide the player’s eye, ensuring the competitive tension of Number Baseball is felt through every pixel.

## 2. Colors: Vibrancy & Depth
Our palette is rooted in high-energy "Action Primaries," balanced by a sophisticated neutral foundation that prevents visual fatigue during long sessions.

### The Palette
*   **Primary (#0057bd):** The "Pulse." Use for primary actions and win-states.
*   **Secondary/Highlight (#755600 / #ffca51):** The "Energy." Use for score multipliers, rank upgrades, and "Ball" feedback.
*   **Tertiary/Success (#006947 / #69f6b8):** The "Strike." Reserved exclusively for positive progress and correct guesses.
*   **Error (#b31b25):** The "Out." Used for failed attempts or critical alerts.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to section content. Boundaries must be defined solely through background color shifts. For example, a `surface-container-low` section should sit directly on a `surface` background. The contrast between these two tones is the only divider permitted.

### The "Glass & Gradient" Rule
To elevate the "mobile web" feel to a premium app-like experience, primary CTAs should utilize a subtle linear gradient from `primary` to `primary_container`. Floating action buttons or modal overlays must use **Glassmorphism**: a semi-transparent `surface_container_lowest` with a `backdrop-blur` of 12px-16px to let game colors bleed through.

## 3. Typography: Editorial Playfulness
We pair **Plus Jakarta Sans** (Display/Headlines) with **Be Vietnam Pro** (Body/Labels) to balance high-energy competition with clinical readability.

*   **Display (L/M/S):** Large, bold, and expressive. Use for "Strike/Ball" counts and final scores. The high-contrast scale between `display-lg` and `body-md` creates an editorial hierarchy that screams "Winner."
*   **Headline & Title:** Rounded and modern. These guide the player through the "Baseball" innings.
*   **Body & Label:** Highly legible. Use for player stats, history logs, and settings.

**Visual Identity Note:** Use `headline-lg` for player names in rankings, but drop to `label-md` for secondary stats like "Win Rate" to create a clear "Hero" vs. "Support" typographic relationship.

## 4. Elevation & Depth: Tonal Layering
Traditional shadows are often "dirty." In this system, we use light and tone to create a 3D arena.

*   **The Layering Principle:** Stacking is our primary tool. 
    *   *Base Level:* `surface`
    *   *Sub-Section:* `surface-container-low`
    *   *Interactive Card:* `surface-container-lowest` (White)
*   **Ambient Shadows:** For "floating" elements like the number input pad, use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(0, 87, 189, 0.06)`. Note the use of a blue-tinted shadow (`primary`) rather than grey to keep the UI "bright."
*   **The "Ghost Border" Fallback:** If accessibility requires a stroke, use `outline-variant` at **15% opacity**. Never 100%.

## 5. Components: The Building Blocks

### Buttons
*   **Primary Action:** Rounded `full`, Gradient (`primary` to `primary_container`), with a subtle `primary_dim` bottom-glow.
*   **Secondary (Number Keys):** `surface-container-high` backgrounds with `on-surface` text. No borders. Large `xl` (3rem) corner radius for a "tactile" feel.

### Cards & Game History
*   **The "No-Divider" Rule:** In the game history list, never use a horizontal line. Separate rounds using `spacing-4` (1rem) and alternating background tones (`surface-container-lowest` vs `surface-container-low`).
*   **Strike/Ball Chips:** Use `tertiary_container` for Strikes and `secondary_container` for Balls. The roundedness should be `full` to mimic a baseball’s curve.

### Inputs (Number Entry)
*   **The Slot Machine Effect:** Instead of a standard text box, use three or four distinct `surface-container-highest` squares with `display-md` typography. When a number is entered, animate a "pop" scale effect to 1.1x.

### Rank/Leaderboard
*   **Overlapping Elements:** Player avatars should overlap the edge of their container slightly, breaking the "box" and creating a sense of movement and "climbing" the ranks.

## 6. Do's and Don'ts

### Do:
*   **Use Asymmetry:** Place the "Inning Count" slightly off-center or overlapping the header card to create a custom, high-end feel.
*   **Embrace White Space:** Use `spacing-8` (2rem) between major game sections to let the energetic colors breathe.
*   **Animate Transitions:** Use "Spring" physics for card entries. The UI should feel as bouncy as a ball.

### Don't:
*   **Don't use pure black:** Use `on-background` (#2a2f32) for text. It keeps the "Energetic Blue" theme feeling premium, not harsh.
*   **Don't use 1px borders:** Even for checkboxes. Use color fills and scale shifts to indicate state.
*   **Don't crowd the screen:** Number Baseball is about focus. If an element doesn't help the player guess the next number, hide it in a `surface-container-low` drawer.

### Accessibility Note:
While we avoid high-contrast borders, ensure that `on-primary` and `on-tertiary` tokens always maintain a 4.5:1 contrast ratio against their respective containers for player readability in outdoor (sunny) conditions.