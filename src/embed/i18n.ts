const dicts = {
  en: {
    replies_one: "{{n}} reply",
    replies_other: "{{n}} replies",
    unavailable: "Message unavailable",
    image: "Image",
  },
  pl: {
    replies_one: "{{n}} odpowiedź",
    replies_other: "{{n}} odpowiedzi",
    unavailable: "Wiadomość niedostępna",
    image: "Obraz",
  },
  fr: {
    replies_one: "{{n}} réponse",
    replies_other: "{{n}} réponses",
    unavailable: "Message indisponible",
    image: "Image",
  },
  de: {
    replies_one: "{{n}} Antwort",
    replies_other: "{{n}} Antworten",
    unavailable: "Nachricht nicht verfügbar",
    image: "Bild",
  },
  es: {
    replies_one: "{{n}} respuesta",
    replies_other: "{{n}} respuestas",
    unavailable: "Mensaje no disponible",
    image: "Imagen",
  },
  it: {
    replies_one: "{{n}} risposta",
    replies_other: "{{n}} risposte",
    unavailable: "Messaggio non disponibile",
    image: "Immagine",
  },
} as const;

type Locale = keyof typeof dicts;
export type EmbedTranslationKey = keyof (typeof dicts)["en"];

function resolveLocale(): Locale {
  const lang = (navigator.language || "en").toLowerCase().slice(0, 2);
  return (Object.keys(dicts) as Locale[]).includes(lang as Locale) ? (lang as Locale) : "en";
}

export function t(key: EmbedTranslationKey, n?: number): string {
  const locale = resolveLocale();
  const dict = dicts[locale];

  if (key === "replies_one" || key === "replies_other") {
    const count = n ?? 0;
    const template = count === 1 ? dict.replies_one : dict.replies_other;
    return template.replace("{{n}}", String(count));
  }

  return dict[key];
}
