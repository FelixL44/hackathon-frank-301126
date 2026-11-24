# FRANK-style Design Tokens & UI Conventions

Pulled from the live CSS of frankinsurance.ai (Nov 2026). This is a light, clean SaaS look: grey and white surfaces, one teal brand color, a navy secondary and a teal-to-navy gradient as the signature.

---

## 1. Stack / libraries

| Purpose | Library | Notes |
|---|---|---|
| Styling | **Tailwind CSS** | Utility classes, 4px spacing scale |
| Components | **shadcn/ui** (built on **Radix UI**) | Theme driven by HSL CSS variables (`--primary: 183 100% 28%`) |
| Icons | **lucide-react** | Stroke 2, mostly `w-4 h-4` / `w-5 h-5` |
| Fonts | **Google Fonts**: Roboto + Plus Jakarta Sans | See import below |
| Dark mode | Tailwind `darkMode: "class"` | `.dark` class on `<html>` |

```bash
npm i -D tailwindcss
npx shadcn@latest init
npm i lucide-react
```

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

---

## 2. Token block

### 2a. Plain CSS (hex), for use without shadcn

```css
:root {
  /* Brand */
  --primary:   #00888F;  /* teal: CTAs, links, active states */
  --secondary: #235986;  /* navy blue: gradient stop, secondary emphasis */
  --accent:    #14203E;  /* deep navy: gradient end, dark surfaces */

  /* Surfaces */
  --bg:     #FCFCFC;
  --card:   #F5F5F5;
  --muted:  #EDEDED;
  --border: #E6E6E6;
  --input:  #B0B0B0;

  /* Text */
  --fg:       #333333;
  --fg-muted: #545454;
  --on-primary: #FCFCFC;

  /* Status / data */
  --danger:  #DB362E;
  --chart-1: #00888F;
  --chart-2: #235986;
  --chart-3: #14203E;
  --chart-4: #4CAE4F;
  --chart-5: #FFA600;

  /* Gradients */
  --brand-gradient:      linear-gradient(to bottom right, #00888F, #235986);
  --brand-gradient-soft: linear-gradient(to bottom right, rgb(0 136 143 / .1), rgb(35 89 134 / .1));
  --headline-gradient:   linear-gradient(to right, #00888F, #235986, #14203E);
  --headline-gradient-light: linear-gradient(to right, #00BCD4, #4A9FB5, #5A7C9C);

  /* Type */
  --font-display: "Plus Jakarta Sans", sans-serif;
  --font-body: "Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-mono: Menlo, monospace;

  /* Shape */
  --radius: 0.5rem;     /* 8px base */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 12px;
  --radius-pill: 9999px;
  --spacing: 0.25rem;   /* 4px unit */

  /* Elevation */
  --shadow-2xs: 0 1px 2px 0 hsl(0 0% 8% / .05);
  --shadow-xs:  0 1px 3px 0 hsl(0 0% 8% / .08);
  --shadow-sm:  0 2px 4px -1px hsl(0 0% 8% / .06), 0 1px 2px -1px hsl(0 0% 8% / .04);
  --shadow:     0 4px 6px -1px hsl(0 0% 8% / .08), 0 2px 4px -2px hsl(0 0% 8% / .05);
  --shadow-md:  0 6px 8px -2px hsl(0 0% 8% / .10), 0 4px 6px -2px hsl(0 0% 8% / .06);
  --shadow-lg:  0 10px 15px -3px hsl(0 0% 8% / .12), 0 4px 8px -4px hsl(0 0% 8% / .08);
  --shadow-xl:  0 20px 25px -5px hsl(0 0% 8% / .14), 0 8px 12px -6px hsl(0 0% 8% / .10);
  --shadow-2xl: 0 25px 50px -12px hsl(0 0% 8% / .20);
  --shadow-card: 0 2px 12px 0 rgb(51 51 51 / .06);

  /* Hover/press overlays */
  --elevate-1: rgba(0,0,0,.03);
  --elevate-2: rgba(0,0,0,.08);
}
```

### 2b. shadcn/ui format (HSL channels), paste into `globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 99%;
    --foreground: 0 0% 20%;
    --card: 0 0% 96%;
    --card-foreground: 0 0% 20%;
    --card-border: 0 0% 90%;
    --popover: 0 0% 99%;
    --popover-foreground: 0 0% 20%;
    --popover-border: 0 0% 90%;
    --primary: 183 100% 28%;
    --primary-foreground: 0 0% 99%;
    --secondary: 207 59% 33%;
    --secondary-foreground: 0 0% 99%;
    --accent: 222 52% 16%;
    --accent-foreground: 0 0% 99%;
    --muted: 0 0% 93%;
    --muted-foreground: 0 0% 33%;
    --destructive: 3 71% 52%;
    --destructive-foreground: 0 0% 99%;
    --border: 0 0% 90%;
    --input: 0 0% 69%;
    --ring: 183 100% 28%;
    --chart-1: 183 100% 28%;
    --chart-2: 207 59% 33%;
    --chart-3: 222 52% 16%;
    --chart-4: 122 39% 49%;
    --chart-5: 39 100% 50%;
    --sidebar: 0 0% 96%;
    --sidebar-foreground: 0 0% 20%;
    --sidebar-primary: 183 100% 28%;
    --sidebar-primary-foreground: 0 0% 99%;
    --sidebar-accent: 0 0% 93%;
    --sidebar-accent-foreground: 0 0% 20%;
    --sidebar-border: 0 0% 90%;
    --sidebar-ring: 183 100% 28%;
    --radius: 0.5rem;
    --font-sans: "Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    --font-serif: Georgia, serif;
    --font-mono: Menlo, monospace;
  }

  .dark {
    --background: 222 52% 9%;      /* #0B1223 navy, not black */
    --foreground: 0 0% 96%;
    --card: 222 53% 12%;
    --card-foreground: 0 0% 96%;
    --card-border: 222 50% 18%;
    --popover: 222 53% 14%;
    --popover-foreground: 0 0% 92%;
    --popover-border: 222 50% 22%;
    --primary: 183 100% 40%;       /* #00C2CC brighter teal */
    --primary-foreground: 0 0% 8%;
    --secondary: 207 33% 47%;
    --secondary-foreground: 0 0% 99%;
    --accent: 222 13% 44%;
    --accent-foreground: 0 0% 99%;
    --muted: 222 50% 16%;
    --muted-foreground: 0 0% 75%;
    --destructive: 3 71% 52%;
    --destructive-foreground: 0 0% 99%;
    --border: 222 53% 12%;
    --input: 222 50% 22%;
    --ring: 183 100% 40%;
    --chart-1: 183 100% 40%;
    --chart-2: 207 33% 47%;
    --chart-3: 222 13% 44%;
    --chart-4: 122 36% 56%;
    --chart-5: 39 100% 60%;
    --sidebar: 222 53% 11%;
    --sidebar-foreground: 0 0% 94%;
    --sidebar-primary: 183 100% 40%;
    --sidebar-primary-foreground: 0 0% 8%;
    --sidebar-accent: 222 50% 18%;
    --sidebar-accent-foreground: 0 0% 92%;
    --sidebar-border: 222 50% 16%;
    --sidebar-ring: 183 100% 40%;
  }

  body {
    @apply bg-background text-foreground font-sans antialiased;
  }
  h1, h2 {
    font-family: "Plus Jakarta Sans", sans-serif;
  }
}
```

### 2c. `tailwind.config.ts` additions

```ts
export default {
  darkMode: ["class"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Roboto", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Helvetica", "Arial", "sans-serif"],
        display: ['"Plus Jakarta Sans"', "sans-serif"],
        mono: ["Menlo", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",               // 8px
        md: "calc(var(--radius) - 2px)",   // 6px
        sm: "calc(var(--radius) - 4px)",   // 4px
        xl: "12px",
      },
      colors: {
        brand: { teal: "#00888F", navy: "#235986", deep: "#14203E", cyan: "#00BCD4" },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(to bottom right, #00888F, #235986)",
      },
    },
  },
};
```

---

## 3. Typography scale

| Element | Font | Size / line-height | Weight | Tailwind |
|---|---|---|---|---|
| H1 (hero) | Plus Jakarta Sans | 72 / 72px (mobile ~48) | 700 | `font-display text-5xl md:text-7xl font-bold leading-none` |
| H2 (section) | Plus Jakarta Sans | 48 / 48px | 700 | `font-display text-4xl md:text-5xl font-bold leading-tight` |
| H3 (card title) | Roboto | 24 / 32px | 700 | `text-2xl font-bold` |
| Hero subhead | Roboto | 20 to 24px, relaxed | 400 | `text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto` |
| Section subhead | Roboto | 18px | 400 | `text-lg text-muted-foreground max-w-2xl mx-auto` |
| Body | Roboto | 16 / 24px | 400 | `text-base` |
| UI / nav | Roboto | 14 / 20px | 500 | `text-sm font-medium` |
| Small / tags | Roboto | 12 / 16 to 18px | 500 | `text-xs font-medium` |

Rules:
- Weights in use: 400, 500, 600, 700 only.
- Letter-spacing stays normal. The only uppercase text is the small "BOOK A DEMO" nav CTA.
- Gradient headline: wrap words in spans with `bg-clip-text text-transparent bg-gradient-to-r from-[#00888F] via-[#235986] to-[#14203E]`. The brand word uses the lighter cyan gradient (`from-[#00BCD4] via-[#4A9FB5] to-[#5A7C9C]`).

---

## 4. Component conventions

### Header / nav
- Fixed, about 65px tall, translucent with blur:
  `fixed top-0 inset-x-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border`
- Nav items are ghost buttons with a `lucide` `ChevronDown` for dropdowns:
  `px-3 py-2 rounded-md text-sm font-medium text-foreground/80 hover:bg-black/[.03]`
- Right side: outline "Login" next to a primary "Get Started" with `ArrowRight`, both `h-9 text-xs rounded-md`.

### Buttons

| Variant | Classes |
|---|---|
| Primary | `bg-primary text-primary-foreground border border-[hsl(183_100%_20%)] rounded-md` |
| Outline / secondary | `bg-transparent border border-black/10 text-foreground rounded-md` |
| Ghost | `bg-transparent text-foreground/80 hover:bg-black/[.03]` |
| Hero size | `h-14 px-8 text-base font-medium rounded-xl` |
| Nav size | `h-9 px-3 text-xs font-medium rounded-md` |
| In-app size | `h-10 px-3 text-sm font-medium rounded-lg` |

- Trailing `ArrowRight` icon (`w-4 h-4 ml-1`) on forward CTAs.
- Primary borders are about 8% darker than the fill (shadcn "opaque button border" trick: `--opaque-button-border-intensity: -8` light / `9` dark).
- Hover: overlay with `--elevate-1` (3% black), press with `--elevate-2` (8% black). Transitions 150 to 300ms.

### Pills / badges (used a lot)
- Hero eyebrow: `rounded-full px-4 py-2 bg-primary/10 border border-primary/20 text-foreground`, with a small icon before the text.
- Feature tags: `rounded-full px-3 py-1.5 text-xs font-medium bg-background/70 border border-border text-muted-foreground`.

### Cards
- `bg-card border border-border rounded-xl p-8 shadow-[0_1px_2px_rgba(0,0,0,.05)]`
- Numbered eyebrow ("01", "02"…) above an H3 title, then muted body text.
- Icon tiles: square with `bg-brand-gradient` (solid) or the 10% soft gradient, white or teal Lucide icon inside.
- Large product screenshots/mockups get `shadow-2xl rounded-xl border`.

### Tabs (product UI)
- Segmented control: active tab `bg-background shadow-sm rounded-sm`, inactive `text-muted-foreground`, `text-sm font-medium px-3 py-1.5`.

---

## 5. Layout & rhythm

- Container: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` (1280px).
- Text blocks centered and narrow: `max-w-2xl` / `max-w-3xl mx-auto text-center`.
- Section padding: `py-24` to `py-32` (96 to 128px); smaller strips (logos) `py-16`.
- Alternate section backgrounds: plain `bg-background` ↔ faint grey `bg-muted/20` or `bg-muted/30`, with an occasional `bg-gradient-to-b from-background to-muted/20` fade.
- One full-bleed brand moment: a section with `bg-brand-gradient` and white text (their "Watch FRANK in Action" video block).
- Page order: hero → value statement → feature cards grid → "As seen in" logos → product demo → gradient video block → reviews → marketplace/integrations → security → final CTA.

---

## 6. Do / don't

**Do**
- Keep teal as the only saturated color in UI chrome; navy only in gradients and dark mode.
- Use 1px `#E6E6E6` hairlines and very soft shadows instead of heavy elevation.
- Use rounded-full pills for tags and labels, and rounded-xl for cards and hero buttons.
- Keep dark mode navy-based (`#0B1223`), never pure black.

**Don't**
- Don't use chart green/amber in UI chrome. They're for data only.
- Don't use the `theme-color` meta value `#6366f1` from their HTML; it's a leftover Tailwind default, not the brand. Use `#00888F`.
- Don't add letter-spacing or uppercase to headings.
