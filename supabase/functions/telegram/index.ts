/**
 * AGROCONTROL · bot de Telegram
 *
 * Recibe los mensajes del bot y los carga en la cuenta del productor.
 * El token del bot nunca sale de las variables de entorno: ni la app ni el
 * repositorio lo conocen.
 *
 * Variables que hay que configurar como secretos del proyecto:
 *   TELEGRAM_TOKEN    el que da BotFather al crear el bot
 *   TELEGRAM_SECRETO  una frase cualquiera, para que sólo Telegram pueda entrar
 */

const TOKEN = Deno.env.get("TELEGRAM_TOKEN") ?? "";
const SECRETO = Deno.env.get("TELEGRAM_SECRETO") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICIO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MESES = ["JUL","AGO","SEP","OCT","NOV","DIC","ENE","FEB","MAR","ABR","MAY","JUN"];

/* ---------- base ---------- */
async function db(ruta: string, opciones: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: SERVICIO,
      Authorization: `Bearer ${SERVICIO}`,
      "Content-Type": "application/json",
      ...(opciones.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function responder(chatId: number, texto: string) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "HTML" }),
  });
}

/* ---------- ayudas ---------- */
const sinAcentos = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Índice de mes dentro de la campaña, que arranca en julio. */
function mesDeCampania(desde: string, hoy: Date) {
  const base = new Date(desde + "T12:00:00");
  const idx = (hoy.getFullYear() - base.getFullYear()) * 12 + (hoy.getMonth() - base.getMonth());
  return idx >= 0 && idx < 12 ? idx : -1;
}

/** Busca un lote nombrado en el texto. Tolera que se escriba distinto. */
function buscarLote(texto: string, lotes: any[]) {
  const t = sinAcentos(texto);
  let mejor: any = null, largo = 0;
  for (const l of lotes) {
    const n = sinAcentos(l.nombre);
    // "Lote 7 — Aguada" se encuentra por "lote 7" o por "aguada"
    for (const parte of n.split(/[—\-·]/).map((x) => x.trim()).filter(Boolean)) {
      if (parte.length > 2 && t.includes(parte) && parte.length > largo) { mejor = l; largo = parte.length; }
    }
  }
  return mejor;
}

const AYUDA =
  "<b>Qué le podés mandar</b>\n\n" +
  "• <code>llovieron 25 mm</code> — suma la lluvia al mes en curso\n" +
  "• <code>nota Lote 7: hay roya en el estrato bajo</code> — guarda una observación\n" +
  "• <code>/estado</code> — los trabajos pendientes de la campaña\n" +
  "• <code>/lluvias</code> — cómo viene la campaña de agua\n" +
  "• <code>/ayuda</code> — esto\n\n" +
  "Todo lo que cargues aparece en la app al instante.";

/* ---------- vínculo entre el chat y la cuenta ---------- */
async function cuentaDe(chatId: number) {
  const r = await db(`telegram_cuentas?chat_id=eq.${chatId}&select=user_id,nombre`);
  return r?.[0] ?? null;
}

async function vincular(chatId: number, codigo: string, nombre: string) {
  const limpio = codigo.trim().toUpperCase();
  const perfiles = await db(
    `perfiles?codigo_telegram=eq.${encodeURIComponent(limpio)}&select=id,nombre,codigo_expira`,
  );
  const p = perfiles?.[0];
  if (!p) return "Ese código no existe. Generá uno nuevo desde la app, en Hoy y esta semana.";
  if (p.codigo_expira && new Date(p.codigo_expira) < new Date())
    return "Ese código ya venció. Generá uno nuevo desde la app.";

  await db("telegram_cuentas", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: p.id, chat_id: chatId, nombre }),
  });
  await db(`perfiles?id=eq.${p.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ codigo_telegram: null, codigo_expira: null }),
  });
  return `Listo, ${p.nombre || "quedaste vinculado"}. Este chat ya escribe en tu cuenta.\n\n${AYUDA}`;
}

/* ---------- acciones ---------- */
async function campaniaEnCurso(userId: string) {
  const r = await db(
    `campanias?user_id=eq.${userId}&estado=eq.curso&select=*&order=desde.desc&limit=1`,
  );
  return r?.[0] ?? null;
}

async function cargarLluvia(userId: string, mm: number) {
  const c = await campaniaEnCurso(userId);
  if (!c) return "No tenés ninguna campaña en curso. Abrila desde la app y volvé a intentar.";
  const idx = mesDeCampania(c.desde, new Date());
  if (idx < 0) return "La fecha de hoy cae fuera de la campaña en curso. Cargalo desde la app.";

  const lluvia = Array.isArray(c.lluvia) ? [...c.lluvia] : new Array(12).fill(0);
  const manual = c.manual && typeof c.manual === "object" ? { ...c.manual } : {};
  const antes = Number(lluvia[idx]) || 0;
  lluvia[idx] = Math.round((antes + mm) * 10) / 10;
  manual[String(idx)] = true;

  await db(`campanias?id=eq.${c.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ lluvia, manual }),
  });
  return `Anotados <b>${mm} mm</b>. ${MESES[idx]} va en ${lluvia[idx]} mm.\n\n` +
    "Ese mes queda como cargado a mano, así que no se pisa con el dato automático.";
}

async function guardarNota(userId: string, texto: string) {
  const c = await campaniaEnCurso(userId);
  if (!c) return "No tenés ninguna campaña en curso. Abrila desde la app y volvé a intentar.";
  const lotes = await db(`lotes?user_id=eq.${userId}&select=id,nombre`);
  const lote = buscarLote(texto, lotes ?? []);
  if (!lote)
    return "¿En qué lote? Nombralo en el mensaje, por ejemplo:\n<code>nota Lote 7: hay roya</code>";

  const nota = texto.replace(/^\s*(nota|monitoreo)\s*/i, "").replace(/^[^:]*:\s*/, "").trim();
  await db("monitoreo", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: crypto.randomUUID(), user_id: userId, campania_id: c.id, lote_id: lote.id,
      fecha: new Date().toISOString().slice(0, 10), tipo: "Cultivo",
      estadio: "", severidad: "Media", nota: nota || texto,
    }),
  });
  return `Guardado en <b>${lote.nombre}</b>. Lo ves en Monitoreo.`;
}

async function estado(userId: string) {
  const c = await campaniaEnCurso(userId);
  if (!c) return "No tenés ninguna campaña en curso.";
  const ord = await db(
    `ordenes?user_id=eq.${userId}&campania_id=eq.${c.id}&estado=neq.completada` +
    `&select=tipo,fecha_plan,superficie,responsable,lote_id&order=fecha_plan.asc&limit=10`,
  );
  if (!ord?.length) return `No hay trabajos pendientes en ${c.nombre}.`;
  const lotes = await db(`lotes?user_id=eq.${userId}&select=id,nombre`);
  const nombre = (id: string) => lotes?.find((l: any) => l.id === id)?.nombre ?? "—";
  const filas = ord.map((o: any) =>
    `• <b>${o.tipo}</b> en ${nombre(o.lote_id)}\n  ${o.fecha_plan} · ${o.superficie} ha · ${o.responsable}`
  );
  return `<b>Pendientes en ${c.nombre}</b>\n\n${filas.join("\n")}`;
}

async function lluvias(userId: string) {
  const c = await campaniaEnCurso(userId);
  if (!c) return "No tenés ninguna campaña en curso.";
  const l = Array.isArray(c.lluvia) ? c.lluvia : [];
  const total = l.reduce((a: number, b: number) => a + (Number(b) || 0), 0);
  const conDato = l.map((mm: number, i: number) => ({ mm: Number(mm) || 0, i }))
                   .filter((x: any) => x.mm > 0);
  if (!conDato.length) return `${c.nombre} todavía no tiene lluvias cargadas.`;
  const detalle = conDato.map((x: any) => `${MESES[x.i]} ${x.mm}`).join(" · ");
  return `<b>${c.nombre}</b>\n${detalle}\n\nTotal: <b>${Math.round(total)} mm</b>`;
}

/* ---------- interpretación del mensaje ---------- */
async function interpretar(userId: string, texto: string) {
  const t = texto.trim();
  const bajo = sinAcentos(t);

  if (/^\/?(ayuda|help|start)/.test(bajo)) return AYUDA;
  if (/^\/?estado/.test(bajo)) return await estado(userId);
  if (/^\/?lluvias?$/.test(bajo)) return await lluvias(userId);

  // "llovieron 25 mm", "lluvia 25", "cayeron 12,5 mm"
  const m = bajo.match(/(?:llovi\w*|lluvia|cayeron|precipit\w*)\D{0,12}(\d+(?:[.,]\d+)?)/);
  if (m) {
    const mm = parseFloat(m[1].replace(",", "."));
    if (mm > 0 && mm < 500) return await cargarLluvia(userId, mm);
    return "Ese número de milímetros no parece real. Probá de nuevo.";
  }

  if (/^(nota|monitoreo)\b/.test(bajo)) return await guardarNota(userId, t);

  // Cualquier otra cosa que nombre un lote se guarda como observación.
  const lotes = await db(`lotes?user_id=eq.${userId}&select=id,nombre`);
  if (buscarLote(t, lotes ?? [])) return await guardarNota(userId, t);

  return "No entendí.\n\n" + AYUDA;
}

/* ---------- entrada ---------- */
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Alta del webhook: se abre una vez desde el navegador.
  if (url.searchParams.get("configurar") === SECRETO && SECRETO) {
    const destino = `${url.origin}${url.pathname}`;
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: destino, secret_token: SECRETO, allowed_updates: ["message"] }),
    });
    return new Response(await r.text(), { headers: { "Content-Type": "application/json" } });
  }

  // De acá en adelante sólo entra Telegram.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== SECRETO) {
    return new Response("no", { status: 401 });
  }

  let cuerpo: any;
  try { cuerpo = await req.json(); } catch { return new Response("ok"); }

  const msg = cuerpo?.message;
  const chatId = msg?.chat?.id;
  const texto: string = msg?.text ?? "";
  if (!chatId) return new Response("ok");

  try {
    if (!texto) {
      await responder(chatId, "Por ahora entiendo sólo texto. Las fotos las cargás desde la app.");
      return new Response("ok");
    }

    const vinc = texto.match(/^\/?vincular\s+([A-Za-z0-9]{4,12})/i);
    if (vinc) {
      const nombre = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ");
      await responder(chatId, await vincular(chatId, vinc[1], nombre));
      return new Response("ok");
    }

    const cuenta = await cuentaDe(chatId);
    if (!cuenta) {
      await responder(
        chatId,
        "Este chat todavía no está vinculado a ninguna cuenta.\n\n" +
        "Entrá a AGROCONTROL, tocá <b>Conectar Telegram</b> en la pantalla de Hoy, " +
        "y mandame el código así:\n<code>vincular ABC123</code>",
      );
      return new Response("ok");
    }

    await responder(chatId, await interpretar(cuenta.user_id, texto));
  } catch (e) {
    console.error(e);
    await responder(chatId, "Se me complicó guardar eso. Probá de nuevo en un rato.");
  }
  return new Response("ok");
});
