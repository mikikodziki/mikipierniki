/**
 * Replaces the browser's date picker with a calendar in the site's style, in the browser.
 *
 * Works like the custom select in Base.astro: the native <input type="date"> stays in the DOM and
 * keeps the value (YYYY-MM-DD), so forms, validation and field-errors.ts work as before. What
 * people see is a button styled like the other fields and, under it, a month grid (a non-modal
 * dialog). Keys follow the WAI-ARIA date picker pattern: arrows move by a day or a week, Home/End
 * to the start or end of the week, PageUp/PageDown by a month (with Shift by a year), Enter picks,
 * Escape closes. min and max are read on every opening, because pages set them from scripts.
 */

const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const DAYS = [
  ["pn", "poniedziałek"],
  ["wt", "wtorek"],
  ["śr", "środa"],
  ["czw", "czwartek"],
  ["pt", "piątek"],
  ["sb", "sobota"],
  ["nd", "niedziela"],
];

const pad = (n: number) => String(n).padStart(2, "0");
/** Local calendar date as YYYY-MM-DD (never toISOString, which shifts to UTC). */
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Same day n months later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
const addMonths = (d: Date, n: number) => {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
};
/** Monday = 0 … Sunday = 6 */
const weekday = (d: Date) => (d.getDay() + 6) % 7;
const long = (d: Date) => d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
/** What the field shows: fits a half-width field on one line; screen readers get the long form */
const short = (d: Date) => d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });

let uid = 0;

export function enhanceDate(input: HTMLInputElement): void {
  if (input.dataset.enhanced) return;
  input.dataset.enhanced = "1";
  const id = input.id || `date-${++uid}`;

  const shell = document.createElement("div");
  shell.className = "date-shell";
  input.parentNode!.insertBefore(shell, input);
  shell.appendChild(input);
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");

  const label = input.closest("label");
  let caption = "Data";
  if (label) {
    const copy = label.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("input, .field-msg").forEach((n) => n.remove());
    caption = (copy.textContent || "").replace(/\s+/g, " ").trim() || caption;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dp";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-expanded", "false");

  const pop = document.createElement("div");
  pop.className = "dp-pop";
  pop.id = `${id}-cal`;
  pop.hidden = true;
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", `Kalendarz: ${caption}`);
  btn.setAttribute("aria-controls", pop.id);

  const head = document.createElement("div");
  head.className = "dp-head";
  const navBtn = (dir: -1 | 1) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `dp-nav dp-nav--${dir < 0 ? "prev" : "next"}`;
    b.setAttribute("aria-label", dir < 0 ? "Poprzedni miesiąc" : "Następny miesiąc");
    b.addEventListener("click", () => show(addMonths(focusDate, dir), false));
    return b;
  };
  const prev = navBtn(-1);
  const next = navBtn(1);
  const title = document.createElement("p");
  title.className = "dp-title";
  title.id = `${id}-cal-title`;
  title.setAttribute("aria-live", "polite");
  head.append(prev, title, next);

  const table = document.createElement("table");
  table.className = "dp-grid";
  table.setAttribute("role", "grid");
  table.setAttribute("aria-labelledby", title.id);
  table.innerHTML = `<thead><tr>${DAYS.map(([s, l]) => `<th scope="col" abbr="${l}">${s}</th>`).join("")}</tr></thead>`;
  const body = document.createElement("tbody");
  table.appendChild(body);

  const foot = document.createElement("div");
  foot.className = "dp-foot";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "dp-link";
  clear.textContent = "Wyczyść";
  clear.addEventListener("click", () => {
    set("");
    close(true);
  });
  const today = document.createElement("button");
  today.type = "button";
  today.className = "dp-link";
  today.textContent = "Dzisiaj";
  today.addEventListener("click", () => show(clamp(new Date()), true));
  foot.append(today, clear);

  pop.append(head, table, foot);
  shell.append(btn, pop);

  let focusDate = new Date();
  let min: string = "";
  let max: string = "";
  const allowed = (d: Date) => (!min || iso(d) >= min) && (!max || iso(d) <= max);
  const clamp = (d: Date) => {
    if (min && iso(d) < min) return parse(min)!;
    if (max && iso(d) > max) return parse(max)!;
    return d;
  };

  const paint = () => {
    const d = parse(input.value);
    btn.textContent = d ? short(d) : "Wybierz datę";
    btn.classList.toggle("is-empty", !d);
    btn.setAttribute("aria-label", `${caption}: ${d ? long(d) : "nie wybrano"}`);
  };

  const set = (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    paint();
  };

  /** Draws the month of `d` with `d` as the one focusable day; moves focus there when asked. */
  const show = (d: Date, focus: boolean) => {
    focusDate = d;
    const y = d.getFullYear();
    const m = d.getMonth();
    title.textContent = `${MONTHS[m]} ${y}`;
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const lead = weekday(first);
    const chosen = input.value;
    const now = iso(new Date());
    body.textContent = "";
    let row = document.createElement("tr");
    for (let i = 0; i < lead; i++) row.appendChild(document.createElement("td"));
    for (let day = 1; day <= days; day++) {
      const date = new Date(y, m, day);
      const value = iso(date);
      const cell = document.createElement("td");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dp-day";
      b.textContent = String(day);
      b.dataset.date = value;
      b.tabIndex = day === d.getDate() ? 0 : -1;
      b.setAttribute("aria-label", long(date));
      if (value === chosen) {
        b.setAttribute("aria-pressed", "true");
        cell.setAttribute("aria-selected", "true");
      }
      if (value === now) b.setAttribute("aria-current", "date");
      if (!allowed(date)) b.setAttribute("aria-disabled", "true");
      cell.appendChild(b);
      row.appendChild(cell);
      if (weekday(date) === 6 && day < days) {
        body.appendChild(row);
        row = document.createElement("tr");
      }
    }
    while (row.children.length < 7) row.appendChild(document.createElement("td"));
    body.appendChild(row);
    // always six weeks, so the calendar keeps its height and the arrows stay under the pointer
    while (body.children.length < 6) {
      const blank = document.createElement("tr");
      for (let i = 0; i < 7; i++) blank.appendChild(document.createElement("td"));
      body.appendChild(blank);
    }
    // no way to page into months with nothing to pick
    const lastPrev = new Date(y, m, 0);
    const firstNext = new Date(y, m + 1, 1);
    prev.disabled = !!min && iso(lastPrev) < min;
    next.disabled = !!max && iso(firstNext) > max;
    // the calendar is already placed in view, so focusing a day never needs to scroll the page
    if (focus) body.querySelector<HTMLButtonElement>(`[data-date="${iso(d)}"]`)?.focus({ preventScroll: true });
  };

  const place = () => {
    // below the field, or above it when there is no room below (80 px stays free for the sticky
    // bar on phones), scrolled into view if neither fits; shifted sideways to stay 8 px off the edges
    pop.classList.remove("dp-pop--up");
    pop.style.left = "0px";
    const r = pop.getBoundingClientRect();
    const field = btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    let shift = 0;
    if (r.right > vw - 8) shift = vw - 8 - r.right;
    if (r.left + shift < 8) shift = 8 - r.left;
    pop.style.left = `${shift}px`;
    if (r.bottom <= innerHeight - 80) return;
    if (field.top - r.height - 6 > 72) pop.classList.add("dp-pop--up");
    else pop.scrollIntoView({ block: "nearest" });
  };

  const open = () => {
    min = input.min;
    max = input.max;
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    // place first, then focus: a focus before placing would scroll the page and skew the measurements
    show(clamp(parse(input.value) ?? new Date()), false);
    place();
    show(focusDate, true);
  };

  const close = (refocus: boolean) => {
    if (pop.hidden) return;
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (refocus) btn.focus();
  };

  btn.addEventListener("click", () => (pop.hidden ? open() : close(true)));
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && pop.hidden) {
      e.preventDefault();
      open();
    }
  });

  body.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".dp-day");
    if (!b || b.getAttribute("aria-disabled") === "true") return;
    set(b.dataset.date!);
    close(true);
  });

  body.addEventListener("keydown", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".dp-day");
    if (!b) return;
    const d = parse(b.dataset.date!)!;
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(d, -1),
      ArrowRight: () => addDays(d, 1),
      ArrowUp: () => addDays(d, -7),
      ArrowDown: () => addDays(d, 7),
      Home: () => addDays(d, -weekday(d)),
      End: () => addDays(d, 6 - weekday(d)),
      PageUp: () => addMonths(d, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(d, e.shiftKey ? 12 : 1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const to = move();
    if (to.getMonth() === d.getMonth() && to.getFullYear() === d.getFullYear()) {
      b.tabIndex = -1;
      const t = body.querySelector<HTMLButtonElement>(`[data-date="${iso(to)}"]`)!;
      t.tabIndex = 0;
      t.focus({ preventScroll: true });
      focusDate = to;
    } else {
      show(to, true);
    }
  });

  pop.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // a dialog around the form must not close too
      close(true);
    }
  });

  // close on a press outside, or when Tab takes focus elsewhere; a click that leaves no focused
  // element (Safari doesn't focus buttons on click, a redrawn month drops its day) keeps it open
  document.addEventListener("pointerdown", (e) => {
    if (!pop.hidden && !shell.contains(e.target as Node)) close(false);
  });
  shell.addEventListener("focusout", (e) => {
    const to = e.relatedTarget as Node | null;
    if (to && !shell.contains(to)) close(false);
  });

  if (label) {
    // the label wraps the field: a click on its caption, or on the calendar's padding or title,
    // would otherwise reach the hidden native input (on phones that opens the system picker)
    label.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("button")) return;
      e.preventDefault();
      if (!pop.contains(t)) btn.focus();
    });
  }

  // other scripts may set or clear the value
  input.addEventListener("change", paint);
  input.form?.addEventListener("reset", () => setTimeout(paint));
  paint();
}
