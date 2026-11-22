/**
 * Per-field error messages for the site's forms (WCAG 3.3.1 and 3.3.3), in the browser.
 *
 * The message goes inside the field's <label>, right under the control, so it keeps working in
 * two-column rows (.row2). It is aria-hidden there, so it never becomes part of the field's name,
 * and screen readers get it through aria-describedby when the field is focused. Each form keeps
 * one role="alert" line with the summary.
 */
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const whenEmpty: Record<string, string> = {
  name: "Wpisz imię i nazwisko.",
  email: "Wpisz adres e-mail.",
  phone: "Wpisz numer telefonu.",
  message: "Napisz kilka słów, w czym mogę pomóc.",
  consent: "Zaznacz to pole, żebym mogła odpisać.",
  acceptedTerms: "Zaznacz akceptację regulaminu.",
};

const date = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });

/** What is wrong with the field, in words, or null when it is fine. */
export function messageFor(el: Field): string | null {
  if (el instanceof HTMLInputElement && el.type === "checkbox") return el.required && !el.checked ? (whenEmpty[el.name] ?? "Zaznacz to pole.") : null;
  const v = el.validity;
  if (el.required && el.value.trim() === "") return whenEmpty[el.name] ?? "Uzupełnij to pole.";
  if (v.typeMismatch && el.type === "email") return "Podaj e-mail w formacie nazwa@domena.pl.";
  if (v.patternMismatch && el.type === "tel") return "Podaj numer telefonu, np. 600 700 800.";
  if (v.badInput) return el.type === "number" ? "Wpisz liczbę." : "Sprawdź, czy wszystko jest wpisane w całości.";
  if (el instanceof HTMLInputElement && v.rangeUnderflow) return el.type === "date" ? `Wybierz datę od ${date(el.min)}.` : `Wpisz co najmniej ${el.min}.`;
  if (el instanceof HTMLInputElement && v.rangeOverflow) return el.type === "date" ? `Wybierz datę do ${date(el.max)}.` : `Wpisz najwyżej ${el.max}.`;
  if (v.tooLong && "maxLength" in el) return `Tu zmieści się najwyżej ${el.maxLength} znaków.`;
  return el.checkValidity() ? null : "Sprawdź to pole.";
}

/** The element people actually focus: the styled button for an enhanced <select> or date, else the field. */
const focusTarget = (el: Field): HTMLElement =>
  el.closest(".select-shell")?.querySelector<HTMLElement>(".sel") ?? el.closest(".date-shell")?.querySelector<HTMLElement>(".dp") ?? el;

/** Shows (or, with null, removes) the message under one field. */
export function setFieldError(el: Field, msg: string | null): void {
  const id = `${el.id}-msg`;
  const targets = [el, focusTarget(el)];
  let box = document.getElementById(id);
  if (!msg) {
    box?.remove();
    for (const t of targets) {
      t.removeAttribute("aria-invalid");
      if (t.getAttribute("aria-describedby") === id) t.removeAttribute("aria-describedby");
    }
    return;
  }
  if (!box) {
    box = document.createElement("span");
    box.id = id;
    box.className = "field-msg";
    box.setAttribute("aria-hidden", "true");
    // a consent box gets it at the end of its line; a box in a group of choices, under the group
    if (el instanceof HTMLInputElement && el.type === "checkbox") (el.closest(".check") ?? el.closest("fieldset") ?? el.closest("label")!).append(box);
    else (el.closest(".select-shell") ?? el.closest(".date-shell") ?? el).after(box);
  }
  box.textContent = msg;
  for (const t of targets) {
    t.setAttribute("aria-invalid", "true");
    t.setAttribute("aria-describedby", id);
  }
}

/** Checks every field, marks the bad ones and returns them in page order. */
export function checkFields(fields: Iterable<Field>): Field[] {
  const bad: Field[] = [];
  for (const el of fields) {
    const msg = messageFor(el);
    setFieldError(el, msg);
    if (msg) bad.push(el);
  }
  return bad;
}

/** Removes every message in the form (e.g. when a dialog opens again). */
export function clearFieldErrors(root: ParentNode): void {
  root.querySelectorAll(".field-msg").forEach((m) => m.remove());
  root.querySelectorAll("[aria-invalid]").forEach((el) => {
    el.removeAttribute("aria-invalid");
    if (el.getAttribute("aria-describedby")?.endsWith("-msg")) el.removeAttribute("aria-describedby");
  });
}

/** Once a field is marked, its message updates as the person types, and goes away when it is fixed. */
export function liveFieldErrors(form: HTMLFormElement, check: (el: Field) => string | null = messageFor): void {
  const update = (e: Event) => {
    const el = e.target as Field;
    if (el.getAttribute?.("aria-invalid") === "true") setFieldError(el, check(el));
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);
}

/**
 * Moves focus to the first bad field (the styled button for a select or a date), with its label in
 * view. On the page that is done by hand: Safari doesn't scroll at all to a field that is inside the
 * window but under the sticky header, and other browsers leave the label above the field under it.
 * A dialog scrolls itself, above the header.
 */
export function focusFirst(bad: Field[]): void {
  if (!bad[0]) return;
  const target = focusTarget(bad[0]);
  if (target.closest("dialog")) {
    target.focus();
    return;
  }
  target.focus({ preventScroll: true });
  const box = (bad[0].closest(".field, .check, fieldset") ?? target).getBoundingClientRect();
  // the site's sticky header (Header.astro), not a page's own <header>
  const top = (document.querySelector("header.top")?.getBoundingClientRect().bottom ?? 0) + 16;
  // the fixed bar at the bottom on phones and tablets (MobileCta.astro)
  const bar = document.querySelector(".mobile-cta");
  const bottom = (bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().top : innerHeight) - 16;
  if (box.top < top || box.bottom > bottom) scrollBy({ top: box.top - top });
}

/** Summary for the form's role="alert" line. */
export const summary = (n: number) => (n === 1 ? "Popraw zaznaczone pole." : `Popraw zaznaczone pola (${n}).`);
