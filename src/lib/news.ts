import { supabase } from "./supabase";

export interface NewsCategory {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  color: string;
  sort_order: number;
}

export interface NewsTag {
  id: string;
  slug: string;
  name: string;
}

export interface NewsArticle {
  id: string;
  slug: string;
  category_id: string | null;
  title: string;
  dek: string | null;
  cover_url: string | null;
  cover_caption: string | null;
  body: string;
  author_name: string;
  is_featured: boolean;
  view_count: number;
  published_at: string | null;
  updated_at: string;
  category?: NewsCategory | null;
}

const ARTICLE_FIELDS =
  "id, slug, category_id, title, dek, cover_url, cover_caption, body, author_name, is_featured, view_count, published_at, updated_at, category:news_categories(*)";

const CARD_FIELDS =
  "id, slug, category_id, title, dek, cover_url, cover_caption, author_name, is_featured, view_count, published_at, updated_at, category:news_categories(*)";

/* Toda busca é tolerante a falha: em erro de rede devolve vazio e a página
   renderiza um estado vazio em vez de quebrar. */

export async function getCategories(): Promise<NewsCategory[]> {
  try {
    const { data } = await supabase
      .from("news_categories")
      .select("*")
      .order("sort_order");
    return (data as NewsCategory[]) ?? [];
  } catch {
    return [];
  }
}

export async function getLatest(limit = 12, offset = 0): Promise<NewsArticle[]> {
  try {
    const { data } = await supabase
      .from("news_articles")
      .select(CARD_FIELDS)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);
    return (data as unknown as NewsArticle[]) ?? [];
  } catch {
    return [];
  }
}

export async function getFeatured(limit = 3): Promise<NewsArticle[]> {
  try {
    const { data } = await supabase
      .from("news_articles")
      .select(CARD_FIELDS)
      .eq("status", "published")
      .eq("is_featured", true)
      .order("published_at", { ascending: false })
      .limit(limit);
    return (data as unknown as NewsArticle[]) ?? [];
  } catch {
    return [];
  }
}

export async function getArticle(slug: string): Promise<NewsArticle | null> {
  try {
    const { data } = await supabase
      .from("news_articles")
      .select(ARTICLE_FIELDS)
      .eq("status", "published")
      .eq("slug", slug)
      .maybeSingle();
    return (data as unknown as NewsArticle) ?? null;
  } catch {
    return null;
  }
}

export async function getByCategory(
  categoryId: string,
  limit = 24,
  excludeId?: string
): Promise<NewsArticle[]> {
  try {
    let q = supabase
      .from("news_articles")
      .select(CARD_FIELDS)
      .eq("status", "published")
      .eq("category_id", categoryId)
      .order("published_at", { ascending: false })
      .limit(limit);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    return (data as unknown as NewsArticle[]) ?? [];
  } catch {
    return [];
  }
}

export async function getCategoryBySlug(slug: string): Promise<NewsCategory | null> {
  try {
    const { data } = await supabase
      .from("news_categories")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    return (data as NewsCategory) ?? null;
  } catch {
    return null;
  }
}

export async function getAllPublishedSlugs(): Promise<
  { slug: string; updated_at: string; published_at: string | null }[]
> {
  try {
    const { data } = await supabase
      .from("news_articles")
      .select("slug, updated_at, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1000);
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getRelated(article: NewsArticle, limit = 3): Promise<NewsArticle[]> {
  let related: NewsArticle[] = [];
  if (article.category_id) {
    related = await getByCategory(article.category_id, limit, article.id);
  }
  if (related.length < limit) {
    const fill = (await getLatest(limit + 4)).filter(
      (a) => a.id !== article.id && !related.some((r) => r.id === a.id)
    );
    related = [...related, ...fill].slice(0, limit);
  }
  return related.slice(0, limit);
}
