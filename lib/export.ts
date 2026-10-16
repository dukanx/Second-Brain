import type { Capture } from "@/components/BrainClient";

function download(content: string, type: string, extension: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `second-brain-${new Date().toISOString().slice(0, 10)}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJSON(captures: Capture[]) {
  download(JSON.stringify(captures, null, 2), "application/json", "json");
}

export function exportMarkdown(captures: Capture[]) {
  const lines = captures.map((c) => {
    const date = new Date(c.created_at).toLocaleDateString("sr", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const star = c.starred ? " ★" : "";
    return `## ${c.title}${star}\n**Type:** ${c.type} | **Project:** ${c.project} | **Date:** ${date}\n\n${c.text}\n\n---`;
  });
  const md = `# Second Brain Export\n*${new Date().toLocaleDateString()}*\n\n---\n\n${lines.join("\n\n")}`;
  download(md, "text/markdown", "md");
}
