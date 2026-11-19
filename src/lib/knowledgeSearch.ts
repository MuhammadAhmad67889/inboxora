import type { BusinessProfile, KnowledgeEntry, PrismaClient } from "@prisma/client";
import { getBusinessProfile, listKnowledgeEntries } from "./inbox";
import { getPrisma } from "./prisma";

/**
 * Keyword search over one workspace's knowledge: its FAQ entries
 * plus its business profile. Plain keyword scoring, no embeddings —
 * the same approach as clientdesk-support's retrieval, written
 * fresh for this app's data shapes.
 *
 * Everything here is workspace-scoped: documents are loaded with
 * the workspaceId in the WHERE clause, so a search can never see
 * another business's FAQ.
 */

/** One searchable piece of knowledge with the citation to show. */
export interface KnowledgeDoc {
  /** FAQ entry id, or null when the doc came from the business profile. */
  entryId: string | null;
  kind: "faq" | "profile";
  title: string;
  content: string;
  /** Shown to the agent, e.g. "FAQ — Delivery charges". */
  sourceLabel: string;
}

export interface ScoredDoc {
  doc: KnowledgeDoc;
  score: number;
}

/** A doc must score at least this to count as an answer. One title
 * word (3 points) or three content words. A single stray content
 * word ("order" in an unrelated entry) is not an answer. */
export const MIN_MATCH_SCORE = 3;

// Common words that carry no meaning for matching.
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "how", "do", "does", "did",
  "can", "could", "i", "my", "me", "you", "your", "it", "its", "this",
  "that", "what", "when", "where", "why", "please", "help", "am",
  "today", "tomorrow", "yesterday", "yet", "still", "now", "much",
  "many", "long", "get", "got", "want", "need", "hi", "hello",
]);

/** Lowercase, split on non-alphanumerics, drop stopwords/short words. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/** Two words match when equal, or when one is a prefix of the other
 * (deliver/delivery, timing/timings). The shorter word needs at
 * least 4 letters so "in" never matches "inside". */
export function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 4 && longer.startsWith(shorter);
}

function countMatches(questionWords: Set<string>, fieldWords: Set<string>): number {
  let hits = 0;
  for (const word of questionWords) {
    for (const fieldWord of fieldWords) {
      if (wordsMatch(word, fieldWord)) {
        hits += 1;
        break;
      }
    }
  }
  return hits;
}

/** Score one doc: a title hit counts 3, a content hit counts 1.
 * Each question word counts once per field. */
export function scoreDoc(question: string, doc: KnowledgeDoc): number {
  const questionWords = new Set(tokenize(question));
  if (questionWords.size === 0) return 0;
  const titleHits = countMatches(questionWords, new Set(tokenize(doc.title)));
  const contentHits = countMatches(questionWords, new Set(tokenize(doc.content)));
  return titleHits * 3 + contentHits;
}

/** Rank docs against a question, best first, keeping only real matches. */
export function searchDocs(
  question: string,
  docs: KnowledgeDoc[],
  limit = 3,
): ScoredDoc[] {
  return docs
    .map((doc) => ({ doc, score: scoreDoc(question, doc) }))
    .filter((result) => result.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Turn FAQ entries into searchable docs. */
export function docsFromEntries(entries: KnowledgeEntry[]): KnowledgeDoc[] {
  return entries.map((entry) => ({
    content: entry.content,
    entryId: entry.id,
    kind: "faq" as const,
    sourceLabel: `FAQ — ${entry.title}`,
    title: entry.title,
  }));
}

const PROFILE_FIELDS: Array<{
  field: "address" | "businessName" | "hours" | "policies";
  label: string;
  title: string;
}> = [
  { field: "businessName", label: "business name", title: "Business name" },
  { field: "hours", label: "hours", title: "Business hours" },
  { field: "address", label: "address", title: "Business address" },
  { field: "policies", label: "policies", title: "Business policies" },
];

/** Turn the business profile into one doc per filled-in field, so a
 * citation can name the exact field an answer came from. */
export function docsFromProfile(profile: BusinessProfile | null): KnowledgeDoc[] {
  if (!profile) return [];
  const docs: KnowledgeDoc[] = [];
  for (const { field, label, title } of PROFILE_FIELDS) {
    const value = profile[field].trim();
    if (!value) continue;
    docs.push({
      content: value,
      entryId: null,
      kind: "profile",
      sourceLabel: `Business info — ${label}`,
      title,
    });
  }
  return docs;
}

/** Load every searchable doc for one workspace. */
export async function loadWorkspaceDocs(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
): Promise<KnowledgeDoc[]> {
  const [entries, profile] = await Promise.all([
    listKnowledgeEntries(workspaceId, db),
    getBusinessProfile(workspaceId, db),
  ]);
  return [...docsFromEntries(entries), ...docsFromProfile(profile)];
}

/** Search one workspace's knowledge for a customer question. */
export async function searchWorkspaceKnowledge(
  workspaceId: string,
  question: string,
  db: PrismaClient = getPrisma(),
  limit = 3,
): Promise<ScoredDoc[]> {
  const docs = await loadWorkspaceDocs(workspaceId, db);
  return searchDocs(question, docs, limit);
}
