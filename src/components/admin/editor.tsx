"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { revalidarSite } from "@/components/admin/use-admin";
import { slugify } from "@/lib/slug";
import { ANIMAIS } from "@/lib/animais";

interface Categoria { id: string; name: string; emoji: string }

interface Form {
  id?: string;
  title: string;
  slug: string;
  dek: string;
  body: string;
  category_id: string;
  cover_url: string;
  cover_caption: string;
  author_name: string;
  is_featured: boolean;
  status: string;
  published_at: string | null;
  scheduled_at: string | null;
}

/** Converte "2026-07-28T08:00" (horário de Brasília no input) para ISO UTC. */
function brasiliaParaISO(local: string): string | null {
  if (!local) return null;
  // input datetime-local não tem fuso; tratamos como America/Sao_Paulo (UTC-3)
  return new Date(local + ":00-03:00").toISOString();
}

/** Converte ISO UTC de volta para o formato do input (horário de Brasília). */
function isoParaBrasilia(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const VAZIO: Form = {
  title: "", slug: "", dek: "", body: "",
  category_id: "", cover_url: "", cover_caption: "",
  author_name: "Pedro Amaral",
  is_featured: false, status: "draft", published_at: null, scheduled_at: null,
};

const SEM_ANIMAIS: string[] = [];

export default function Editor({ articleId }: { articleId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(VAZIO);
  const [animais, setAnimais] = useState<string[]>(SEM_ANIMAIS);
  const [secundarias, setSecundarias] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [slugTravado, setSlugTravado] = useState(Boolean(articleId));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [quandoAgendar, setQuandoAgendar] = useState("");
  const [subindoCapa, setSubindoCapa] = useState(false);
  const [subindoFoto, setSubindoFoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fotoCorpoRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabaseBrowser()
      .from("news_categories")
      .select("id, name, emoji")
      .order("sort_order")
      .then(({ data }) => setCategorias((data as Categoria[]) ?? []));

    if (articleId) {
      supabaseBrowser()
        .from("news_articles")
        .select("*")
        .eq("id", articleId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setForm({
              id: data.id,
              title: data.title ?? "",
              slug: data.slug ?? "",
              dek: data.dek ?? "",
              body: data.body ?? "",
              category_id: data.category_id ?? "",
              cover_url: data.cover_url ?? "",
              cover_caption: data.cover_caption ?? "",
              author_name: data.author_name ?? "Pedro Amaral",
              is_featured: Boolean(data.is_featured),
              status: data.status ?? "draft",
              published_at: data.published_at,
              scheduled_at: data.scheduled_at,
            });
            setAnimais((data.animals as string[]) ?? []);
            if (data.status === "scheduled" && data.scheduled_at) {
              setQuandoAgendar(isoParaBrasilia(data.scheduled_at));
            }
          }
        });
      supabaseBrowser()
        .from("news_article_categories")
        .select("category_id")
        .eq("article_id", articleId)
        .then(({ data }) => setSecundarias((data ?? []).map((r) => r.category_id)));
    }
  }, [articleId]);

  function alternarLista(lista: string[], setLista: (v: string[]) => void, valor: string) {
    setLista(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);
  }

  function set<K extends keyof Form>(campo: K, valor: Form[K]) {
    setForm((f) => {
      const novo = { ...f, [campo]: valor };
      if (campo === "title" && !slugTravado) novo.slug = slugify(String(valor));
      return novo;
    });
  }

  async function subirCapa(arquivo: File) {
    setSubindoCapa(true);
    setMsg("");
    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "jpg";
    const caminho = `news/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabaseBrowser()
      .storage.from("sponsored")
      .upload(caminho, arquivo, { cacheControl: "31536000", upsert: false });
    setSubindoCapa(false);
    if (error) {
      setMsg("❌ Falha ao subir a imagem: " + error.message);
      return;
    }
    const { data } = supabaseBrowser().storage.from("sponsored").getPublicUrl(caminho);
    set("cover_url", data.publicUrl);
  }

  /** Insere marcação de formatação em volta do texto selecionado no corpo. */
  function formatar(antes: string, depois = "", exemplo = "texto") {
    const ta = bodyRef.current;
    if (!ta) return;
    const ini = ta.selectionStart ?? form.body.length;
    const fim = ta.selectionEnd ?? form.body.length;
    const selecao = form.body.slice(ini, fim) || exemplo;
    const novo = form.body.slice(0, ini) + antes + selecao + depois + form.body.slice(fim);
    set("body", novo);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ini + antes.length, ini + antes.length + selecao.length);
    });
  }

  async function subirFotoCorpo(arquivo: File) {
    setSubindoFoto(true);
    setMsg("");
    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "jpg";
    const caminho = `news-img/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabaseBrowser()
      .storage.from("sponsored")
      .upload(caminho, arquivo, { cacheControl: "31536000", upsert: false });
    setSubindoFoto(false);
    if (error) {
      setMsg("❌ Falha ao subir a foto: " + error.message);
      return;
    }
    const { data } = supabaseBrowser().storage.from("sponsored").getPublicUrl(caminho);
    formatar(`\n\n![Escreva a legenda desta foto aqui](${data.publicUrl})\n\n`, "", "");
  }

  // acao: undefined = salvar mantendo status | "publish" | "draft" | "schedule"
  async function salvar(acao?: "publish" | "draft" | "schedule") {
    if (!form.title.trim()) { setMsg("❌ A matéria precisa de um título."); return; }
    if (!form.slug.trim()) { setMsg("❌ A matéria precisa de um endereço (slug)."); return; }
    if (!form.body.trim()) { setMsg("❌ A matéria está sem texto."); return; }

    let scheduledISO: string | null = form.scheduled_at;
    if (acao === "schedule") {
      scheduledISO = brasiliaParaISO(quandoAgendar);
      if (!scheduledISO) { setMsg("❌ Escolha a data e a hora do agendamento."); return; }
      if (new Date(scheduledISO).getTime() <= Date.now()) {
        setMsg("❌ O horário do agendamento precisa ser no futuro."); return;
      }
    }

    setSalvando(true);
    setMsg("");

    const status =
      acao === "publish" ? "published"
      : acao === "draft" ? "draft"
      : acao === "schedule" ? "scheduled"
      : form.status;

    const registro = {
      animals: animais,
      title: form.title.trim(),
      slug: form.slug.trim(),
      dek: form.dek.trim() || null,
      body: form.body.trim(),
      category_id: form.category_id || null,
      cover_url: form.cover_url.trim() || null,
      cover_caption: form.cover_caption.trim() || null,
      author_name: form.author_name.trim() || "Pedro Amaral",
      is_featured: form.is_featured,
      status,
      scheduled_at: status === "scheduled" ? scheduledISO : null,
      published_at:
        status === "published" ? form.published_at ?? new Date().toISOString() : form.published_at,
      updated_at: new Date().toISOString(),
    };

    const sb = supabaseBrowser();
    let erro: string | null = null;
    let idFinal = form.id;

    if (form.id) {
      const { error } = await sb.from("news_articles").update(registro).eq("id", form.id);
      erro = error?.message ?? null;
    } else {
      const { data, error } = await sb.from("news_articles").insert(registro).select("id").single();
      erro = error?.message ?? null;
      idFinal = data?.id;
    }

    setSalvando(false);

    if (erro) {
      setMsg(
        erro.includes("duplicate")
          ? "❌ Já existe uma matéria com esse endereço (slug). Mude o slug."
          : "❌ Erro ao salvar: " + erro
      );
      return;
    }

    // categorias secundárias: regrava o vínculo (sem incluir a principal)
    if (idFinal) {
      await sb.from("news_article_categories").delete().eq("article_id", idFinal);
      const validas = secundarias.filter((c) => c && c !== form.category_id);
      if (validas.length > 0) {
        await sb.from("news_article_categories").insert(
          validas.map((category_id) => ({ article_id: idFinal, category_id }))
        );
      }
    }

    setForm((f) => ({ ...f, id: idFinal, status, published_at: registro.published_at, scheduled_at: registro.scheduled_at }));
    await revalidarSite(status === "published" ? registro.slug : undefined);
    setMsg(
      status === "published" ? "✅ Publicada! Já está no ar."
      : status === "scheduled" ? `🗓 Agendada para ${quandoAgendar.replace("T", " às ")} (horário de Brasília).`
      : "✅ Rascunho salvo."
    );
    if (!articleId && idFinal) router.replace(`/redacao/editar/${idFinal}`);
  }

  async function excluir() {
    if (!form.id) return;
    if (!confirm(`Excluir de vez a matéria "${form.title}"? Essa ação não tem volta.`)) return;
    await supabaseBrowser().from("news_articles").delete().eq("id", form.id);
    await revalidarSite();
    router.push("/redacao");
  }

  return (
    <div className="admin-editor">
      <header className="admin-topo">
        <Link href="/redacao" className="btn-ghost">← Voltar</Link>
        <div className="admin-acoes">
          {form.status === "published" && form.slug && (
            <a className="btn-ghost" href={`/noticias/${form.slug}`} target="_blank" rel="noreferrer">
              Ver no site ↗
            </a>
          )}
          {form.id && form.status !== "published" && (
            <a className="btn-ghost" href={`/redacao/previa/${form.id}`} target="_blank" rel="noreferrer">
              👁 Prévia
            </a>
          )}
          {form.id && (
            <Link className="btn-ghost" href={`/redacao/social/${form.id}`}>
              📷 Instagram
            </Link>
          )}
          <button className="btn-ghost" disabled={salvando} onClick={() => salvar()}>
            💾 Salvar
          </button>
          {form.status === "published" ? (
            <button className="btn-ghost" disabled={salvando} onClick={() => salvar("draft")}>
              Despublicar
            </button>
          ) : (
            <button className="btn-primary" disabled={salvando} onClick={() => salvar("publish")}>
              🚀 Publicar agora
            </button>
          )}
        </div>
      </header>

      {form.status === "scheduled" && form.scheduled_at && (
        <p className="admin-msg" style={{ background: "#eef6ff", borderColor: "#bfdbfe" }}>
          🗓 Esta matéria está <b>agendada</b> para {isoParaBrasilia(form.scheduled_at).replace("T", " às ")}{" "}
          (horário de Brasília). Ela entra no ar sozinha nesse horário.
        </p>
      )}

      {msg && <p className="admin-msg">{msg}</p>}

      <div className="admin-form">
        <label>
          Título
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Ex.: Cachorro pode comer melancia? Veja os cuidados"
          />
        </label>

        <label>
          Endereço (slug)
          <div className="admin-slug">
            <span>maestropet.com/noticias/</span>
            <input
              value={form.slug}
              onChange={(e) => { setSlugTravado(true); set("slug", slugify(e.target.value)); }}
            />
          </div>
        </label>

        <div className="admin-linha2">
          <label>
            Categoria
            <select value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
              <option value="">— Sem categoria —</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={form.is_featured}
              onChange={(e) => set("is_featured", e.target.checked)}
            />
            ⭐ Manchete (destaque na capa)
          </label>
        </div>

        <label>
          Para quais animais é esta matéria?
          <div className="admin-chips">
            {ANIMAIS.map((a) => (
              <button
                key={a.slug}
                type="button"
                className={animais.includes(a.slug) ? "on" : ""}
                onClick={() => alternarLista(animais, setAnimais, a.slug)}
              >
                {a.emoji} {a.nome}
              </button>
            ))}
          </div>
        </label>

        <label>
          Categorias secundárias (opcional — a principal é a de cima)
          <div className="admin-chips">
            {categorias
              .filter((c) => c.id !== form.category_id)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={secundarias.includes(c.id) ? "on" : ""}
                  onClick={() => alternarLista(secundarias, setSecundarias, c.id)}
                >
                  {c.emoji} {c.name}
                </button>
              ))}
          </div>
        </label>

        <label>
          Subtítulo (linha fina)
          <input
            value={form.dek}
            onChange={(e) => set("dek", e.target.value)}
            placeholder="Uma frase que complementa o título e convida à leitura"
          />
        </label>

        <label>
          Imagem de capa
          <div className="admin-capa">
            <input
              value={form.cover_url}
              onChange={(e) => set("cover_url", e.target.value)}
              placeholder="Cole a URL de uma imagem ou use o botão ao lado"
            />
            <button
              type="button" className="btn-ghost" disabled={subindoCapa}
              onClick={() => fileRef.current?.click()}
            >
              {subindoCapa ? "Subindo…" : "📤 Subir imagem"}
            </button>
            <input
              ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) subirCapa(f); }}
            />
          </div>
          {form.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.cover_url} alt="Prévia da capa" className="admin-capa-previa" />
          )}
        </label>

        <label>
          Legenda da capa (opcional)
          <input
            value={form.cover_caption}
            onChange={(e) => set("cover_caption", e.target.value)}
            placeholder="Ex.: Foto: Getty Images"
          />
        </label>

        <label>
          Texto da matéria
          <div className="editor-toolbar">
            <button type="button" onClick={() => formatar("**", "**")} title="Negrito"><b>B</b></button>
            <button type="button" onClick={() => formatar("*", "*")} title="Itálico"><i>I</i></button>
            <button type="button" onClick={() => formatar("\n\n## ", "", "Intertítulo")}>Intertítulo</button>
            <button type="button" onClick={() => formatar("\n\n> ", "", "Frase em destaque")}>❝ Destaque</button>
            <button type="button" onClick={() => formatar("\n\n- ", "", "item da lista")}>• Lista</button>
            <button type="button" disabled={subindoFoto} onClick={() => fotoCorpoRef.current?.click()}>
              {subindoFoto ? "Subindo…" : "📷 Foto no texto"}
            </button>
            <input
              ref={fotoCorpoRef} type="file" accept="image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) subirFotoCorpo(f); e.target.value = ""; }}
            />
          </div>
          <textarea
            ref={bodyRef}
            rows={18}
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            placeholder={"Escreva aqui. Separe os parágrafos com uma linha em branco.\n\nSelecione um trecho e use os botões acima para formatar."}
          />
          <span className="editor-dica">
            Dica: selecione um trecho e clique em <b>B</b> ou <i>I</i>. Use <b>Intertítulo</b> para
            dividir a matéria em seções, <b>❝ Destaque</b> para frases de efeito e <b>📷 Foto no texto</b>{" "}
            para ilustrar (edite a legenda entre os colchetes).
          </span>
        </label>

        <label>
          Assinatura
          <input value={form.author_name} onChange={(e) => set("author_name", e.target.value)} />
        </label>

        <div className="admin-agendar">
          <div className="admin-agendar-titulo">🗓 Agendar publicação</div>
          <p>Escolha uma data e hora futuras (horário de Brasília) para a matéria entrar no ar sozinha.</p>
          <div className="admin-agendar-linha">
            <input
              type="datetime-local"
              value={quandoAgendar}
              onChange={(e) => setQuandoAgendar(e.target.value)}
            />
            <button
              type="button" className="btn-primary"
              disabled={salvando || !quandoAgendar}
              onClick={() => salvar("schedule")}
            >
              Agendar
            </button>
            {form.status === "scheduled" && (
              <button
                type="button" className="btn-ghost"
                disabled={salvando}
                onClick={() => { setQuandoAgendar(""); salvar("draft"); }}
              >
                Cancelar agendamento
              </button>
            )}
          </div>
        </div>

        {form.id && (
          <button className="btn-perigo" onClick={excluir}>
            🗑 Excluir matéria
          </button>
        )}
      </div>
    </div>
  );
}
