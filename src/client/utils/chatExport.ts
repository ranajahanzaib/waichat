import type { Conversation, Message } from "../storage";

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return slug || "waichat-export";
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function exportAsMarkdown(conversation: Conversation, messages: Message[]): void {
  const title = conversation.title || "WaiChat Export";
  const date = formatDate(Date.now());

  const lines: string[] = [`# ${title}`, `_Exported from WaiChat on ${date}_`, "", "---", ""];

  for (const msg of messages) {
    const role = msg.role === "user" ? "**User**" : "**Assistant**";
    lines.push(role);
    lines.push(msg.content || "");
    lines.push("");
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(title)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export function exportAsPdf(conversation: Conversation, messages: Message[]): void {
  const title = conversation.title || "WaiChat Export";
  const date = formatDate(Date.now());

  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Convert content: fenced code blocks → <pre><code>, rest -> escaped paragraphs
  function renderContent(raw: string): string {
    if (!raw) return "";
    const parts = raw.split(/(```[\s\S]*?```)/g);
    return parts
      .map((part) => {
        if (part.startsWith("```")) {
          const inner = part.replace(/^```[a-zA-Z0-9+#_-]*\n?/, "").replace(/```$/, "");
          return `<pre><code>${escapeHtml(inner)}</code></pre>`;
        }
        if (!part) return "";
        return `<p>${escapeHtml(part).replace(/\r?\n/g, "<br>")}</p>`;
      })
      .join("");
  }

  const messagesHtml = messages
    .map((msg) => {
      const roleLabel = msg.role === "user" ? "User" : "Assistant";
      return `<div class="message">
  <div class="role">${roleLabel}</div>
  <div class="content">${renderContent(msg.content)}</div>
</div>`;
    })
    .join("\n");

  const existing = document.getElementById("waichat-print-export");
  if (existing) existing.remove();

  const styleId = "waichat-print-style";
  const existingStyle = document.getElementById(styleId);
  if (existingStyle) existingStyle.remove();

  const styleEl = document.createElement("style");
  styleEl.id = styleId;
  styleEl.textContent = `
    #waichat-print-export {
      display: none;
    }
    @media print {
      html, body {
        background: white !important;
        color: #111 !important;
      }
      body > *:not(#waichat-print-export) {
        display: none !important;
      }
      #waichat-print-export {
        display: block !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        line-height: 1.6;
        max-width: 720px;
        margin: 0 auto;
        padding: 40px 24px;
      }
      #waichat-print-export h1 {
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 4px;
      }
      #waichat-print-export .export-meta {
        color: #666;
        font-style: italic;
        font-size: 12px;
        margin-bottom: 24px;
      }
      #waichat-print-export hr {
        border: none;
        border-top: 1px solid #ddd;
        margin: 24px 0;
      }
      #waichat-print-export .message {
        margin-bottom: 20px;
        break-inside: avoid;
      }
      #waichat-print-export .role {
        font-weight: 700;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #444;
        margin-bottom: 4px;
      }
      #waichat-print-export .content p {
        margin: 0 0 8px;
      }
      #waichat-print-export pre {
        background: #f5f5f5;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 12px;
        overflow-x: auto;
        margin: 8px 0;
        break-inside: avoid;
      }
      #waichat-print-export code {
        font-family: "SF Mono", "Fira Code", "Fira Mono", monospace;
        font-size: 12px;
      }
    }
  `;

  const div = document.createElement("div");
  div.id = "waichat-print-export";
  div.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    <div class="export-meta">Exported from WaiChat on ${date}</div>
    <hr>
    ${messagesHtml}
  `;

  document.head.appendChild(styleEl);
  document.body.appendChild(div);

  const cleanup = () => {
    div.remove();
    styleEl.remove();
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
}
